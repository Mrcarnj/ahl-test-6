// app/(protected)/worked-map.tsx
//
// "Where I've Worked": a US + Canada map with a pin at every home team's city
// the official has a game at, filtered by season. Reached from Profile.
//
// The app is portrait-only and stays that way: on a phone the whole screen is
// drawn turned 90° clockwise, so it reads right way up once the phone is held
// sideways. The web build draws it unrotated.
//
// The map pinches to zoom (up to MAX_ZOOM), pans while zoomed, and double-tap
// zooms in or back out. Pins are drawn over the map rather than inside its
// transform, so they stay sharp and the same size at any zoom, and taps are
// matched to the nearest pin in screen space, so packed areas like the
// Northeast are easy to hit once zoomed in.

import { currentSeasonLabel } from '@/src/lib/season';
import { isWeb } from '@/src/lib/platform';
import { MAP_ASPECT, WorkedCity, workedCities } from '@/src/lib/workedMap';
import { useSchedule } from '@/src/providers/ScheduleProvider';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    Image,
    LayoutChangeEvent,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    SharedValue,
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withDecay,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

const ALL_SEASONS = 'all';
const PIN = 26;
const PIN_SELECTED = 36;
/**
 * Where the tip sits in Ionicons' `location` glyph, as a fraction of the icon
 * size from the top (the glyph has a little padding below the point).
 */
const PIN_TIP = 0.94;
/** How close (in points on screen) a tap must land to a pin to select it. */
const PIN_HIT_RADIUS = 22;
const MAX_ZOOM = 6;
const DOUBLE_TAP_ZOOM = 2.5;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function WorkedMapScreen() {
    const router = useRouter();
    const { myGames } = useSchedule();
    const window = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const currentSeason = currentSeasonLabel();
    // The stats screen opens the map on the range it's showing.
    const params = useLocalSearchParams<{ season?: string }>();
    const [season, setSeason] = useState(params.season || currentSeason);
    const [selected, setSelected] = useState<string | null>(null);
    const [mapBox, setMapBox] = useState({ width: 0, height: 0 });

    const seasons = useMemo(() => {
        const labels = new Set(myGames.map(g => g.season).filter(Boolean));
        labels.add(currentSeason);
        return [...labels].sort().reverse();
    }, [myGames, currentSeason]);

    const cities = useMemo(() => {
        const games = season === ALL_SEASONS ? myGames : myGames.filter(g => g.season === season);
        return workedCities(games, format(new Date(), 'yyyy-MM-dd'));
    }, [myGames, season]);

    const totalWorked = cities.reduce((sum, c) => sum + c.worked, 0);
    const citiesWorked = cities.filter(c => c.worked > 0).length;

    const close = () => (router.canGoBack() ? router.back() : router.replace('/(protected)/(tabs)/profile'));

    const selectSeason = (label: string) => {
        setSeason(label);
        setSelected(null);
    };

    const toggle = useCallback(
        (team: string | null) => setSelected(prev => (team === null || prev === team ? null : team)),
        []
    );

    // Landscape box: the phone's long side is this screen's width. The phone's
    // top (notch / Dynamic Island) ends up on the left after rotating.
    const rotate = !isWeb;
    const boxWidth = rotate ? window.height : window.width;
    const boxHeight = rotate ? window.width : window.height;
    const padLeft = rotate ? insets.top : insets.left;
    const padRight = rotate ? insets.bottom : insets.right;

    const content = (
        <View
            style={[
                styles.box,
                { width: boxWidth, height: boxHeight, paddingLeft: padLeft + 12, paddingRight: padRight + 12 },
                rotate && {
                    position: 'absolute',
                    left: (window.width - boxWidth) / 2,
                    top: (window.height - boxHeight) / 2,
                    transform: [{ rotate: '90deg' }],
                },
            ]}
        >
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={close}
                    accessibilityRole="button"
                    accessibilityLabel="Close map"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.closeButton}
                >
                    <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.title}>Where I&apos;ve Worked</Text>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.chips}
                    contentContainerStyle={styles.chipsContent}
                >
                    {[...seasons, ALL_SEASONS].map(label => {
                        const active = label === season;
                        return (
                            <TouchableOpacity
                                key={label}
                                onPress={() => selectSeason(label)}
                                style={[styles.chip, active && styles.chipActive]}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                            >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                    {label === ALL_SEASONS
                                        ? 'All Seasons'
                                        : label === currentSeason
                                            ? `This Season (${label})`
                                            : label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <View style={styles.body}>
                <View
                    style={styles.mapArea}
                    onLayout={(e: LayoutChangeEvent) =>
                        setMapBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
                    }
                >
                    {mapBox.width > 0 && (
                        <ZoomableMap
                            area={mapBox}
                            cities={cities}
                            selected={selected}
                            onTap={toggle}
                        />
                    )}
                    {cities.length === 0 && (
                        <View style={styles.empty} pointerEvents="none">
                            <Text style={styles.emptyText}>
                                {season === ALL_SEASONS ? 'No games yet' : `No games in ${season} yet`}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={styles.sidebar}>
                    <Text style={styles.summaryBig}>{citiesWorked}</Text>
                    <Text style={styles.summaryLabel}>
                        {citiesWorked === 1 ? 'city' : 'cities'} · {plural(totalWorked, 'game')}
                    </Text>
                    <FlatList
                        data={cities}
                        keyExtractor={c => c.team}
                        style={styles.list}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                onPress={() => toggle(item.team)}
                                style={[styles.row, item.team === selected && styles.rowSelected]}
                            >
                                <Ionicons
                                    name={item.worked > 0 ? 'location' : 'location-outline'}
                                    size={16}
                                    color={ORANGE}
                                />
                                <Text style={styles.rowCity} numberOfLines={1}>{item.city}</Text>
                                <Text style={styles.rowCount}>
                                    {item.worked > 0 ? item.worked : '–'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    />
                    {cities.some(c => c.upcoming > 0) && (
                        <View style={styles.legend}>
                            <Ionicons name="location-outline" size={14} color={ORANGE} />
                            <Text style={styles.legendText}>upcoming only</Text>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );

    return (
        <GestureHandlerRootView style={styles.screen}>
            <StatusBar hidden />
            {content}
        </GestureHandlerRootView>
    );
}

const clampTo = (value: number, min: number, max: number) => {
    'worklet';
    return Math.min(max, Math.max(min, value));
};

/** How far the map may slide from centre on one axis at a given zoom. */
const panLimit = (scale: number, length: number, areaLength: number) => {
    'worklet';
    return Math.max(0, (scale * length - areaLength) / 2);
};

type ZoomableMapProps = {
    /** Size of the space the map gets; the image is centred in it. */
    area: { width: number; height: number };
    cities: WorkedCity[];
    selected: string | null;
    /** A pin's team when a tap lands on one, otherwise null. */
    onTap: (team: string | null) => void;
};

/**
 * The map image and its pins under one transform: translate, then scale about
 * the image's centre. With centre c, a point q on the image is drawn at
 * c + t + s * (q - c); every gesture below solves that for whichever term it
 * moves. Gesture coordinates are in this view's own (unrotated) space.
 */
function ZoomableMap({ area, cities, selected, onTap }: ZoomableMapProps) {
    // The image keeps its aspect ratio inside the space it gets.
    const width = Math.min(area.width, area.height * MAP_ASPECT);
    const height = width / MAP_ASPECT;
    const cx = area.width / 2;
    const cy = area.height / 2;

    const scale = useSharedValue(1);
    const tx = useSharedValue(0);
    const ty = useSharedValue(0);
    const start = useSharedValue({ s: 1, x: 0, y: 0, fx: 0, fy: 0 });
    // The finger during a pan: where it went down, where it was last, and its
    // smoothed velocity, all in this view's own space.
    const drag = useSharedValue({ x: 0, y: 0, lastX: 0, lastY: 0, lastT: 0, vx: 0, vy: 0 });
    const [zoomed, setZoomed] = useState(false);

    useAnimatedReaction(
        () => scale.value > 1.01,
        (isZoomed, was) => {
            if (isZoomed !== was) scheduleOnRN(setZoomed, isZoomed);
        }
    );

    const resetZoom = useCallback(() => {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
    }, [scale, tx, ty]);

    // Picking a city from the list while zoomed in brings its pin into view.
    useEffect(() => {
        const city = cities.find(c => c.team === selected);
        if (!city) return;
        const s = scale.value;
        const qx = city.x * width - width / 2;
        const qy = city.y * height - height / 2;
        const px = cx + tx.value + s * qx;
        const py = cy + ty.value + s * qy;
        const margin = 30;
        if (px > margin && px < area.width - margin && py > margin && py < area.height - margin) return;
        tx.value = withTiming(clampTo(-s * qx, -panLimit(s, width, area.width), panLimit(s, width, area.width)));
        ty.value = withTiming(clampTo(-s * qy, -panLimit(s, height, area.height), panLimit(s, height, area.height)));
        // Only a new selection moves the map, not a zoom or pan afterwards.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected]);

    const handleTap = useCallback(
        (x: number, y: number, s: number, offsetX: number, offsetY: number) => {
            let best: string | null = null;
            let bestDistance = PIN_HIT_RADIUS;
            for (const city of cities) {
                const px = cx + offsetX + s * (city.x * width - width / 2);
                // Aim at the pin's head, which sits above the city.
                const py = cy + offsetY + s * (city.y * height - height / 2) - PIN * 0.6;
                const distance = Math.hypot(px - x, py - y);
                if (distance <= bestDistance) {
                    best = city.team;
                    bestDistance = distance;
                }
            }
            onTap(best);
        },
        [cities, cx, cy, width, height, onTap]
    );

    const gesture = useMemo(() => {
        const settle = () => {
            'worklet';
            const s = clampTo(scale.value, 1, MAX_ZOOM);
            // Rescale the offset too, so the middle of the view stays put.
            const k = s / scale.value;
            const limitX = panLimit(s, width, area.width);
            const limitY = panLimit(s, height, area.height);
            scale.value = withTiming(s);
            tx.value = withTiming(clampTo(tx.value * k, -limitX, limitX));
            ty.value = withTiming(clampTo(ty.value * k, -limitY, limitY));
        };

        const pinch = Gesture.Pinch()
            .onStart(e => {
                start.value = { s: scale.value, x: tx.value, y: ty.value, fx: e.focalX, fy: e.focalY };
            })
            .onUpdate(e => {
                const from = start.value;
                // A little give past the limits, settled on release.
                const s = clampTo(from.s * e.scale, 0.8, MAX_ZOOM * 1.2);
                // The image point that was under the fingers stays under them.
                const qx = (from.fx - cx - from.x) / from.s;
                const qy = (from.fy - cy - from.y) / from.s;
                scale.value = s;
                tx.value = e.focalX - cx - s * qx;
                ty.value = e.focalY - cy - s * qy;
            })
            .onEnd(settle);

        // Driven by the finger's position (e.x / e.y), not translationX/Y or
        // velocityX/Y. Positions are in this view's own space, so they follow
        // the 90° rotation; translation and velocity are measured against the
        // window, so on the rotated phone screen a drag down moved the map left.
        const pan = Gesture.Pan()
            .maxPointers(1)
            .onStart(e => {
                start.value = { ...start.value, x: tx.value, y: ty.value };
                drag.value = { x: e.x, y: e.y, lastX: e.x, lastY: e.y, lastT: Date.now(), vx: 0, vy: 0 };
            })
            .onUpdate(e => {
                const d = drag.value;
                const now = Date.now();
                const dt = Math.max(1, now - d.lastT);
                drag.value = {
                    ...d,
                    lastX: e.x,
                    lastY: e.y,
                    lastT: now,
                    vx: 0.7 * (((e.x - d.lastX) / dt) * 1000) + 0.3 * d.vx,
                    vy: 0.7 * (((e.y - d.lastY) / dt) * 1000) + 0.3 * d.vy,
                };
                const limitX = panLimit(scale.value, width, area.width);
                const limitY = panLimit(scale.value, height, area.height);
                tx.value = clampTo(start.value.x + e.x - d.x, -limitX, limitX);
                ty.value = clampTo(start.value.y + e.y - d.y, -limitY, limitY);
            })
            .onEnd(() => {
                const d = drag.value;
                // A finger that stopped before lifting shouldn't fling.
                const still = Date.now() - d.lastT > 80;
                const limitX = panLimit(scale.value, width, area.width);
                const limitY = panLimit(scale.value, height, area.height);
                tx.value = withDecay({ velocity: still ? 0 : d.vx, clamp: [-limitX, limitX] });
                ty.value = withDecay({ velocity: still ? 0 : d.vy, clamp: [-limitY, limitY] });
            });

        const doubleTap = Gesture.Tap()
            .numberOfTaps(2)
            .onEnd(e => {
                if (scale.value > 1.01) {
                    scale.value = withTiming(1);
                    tx.value = withTiming(0);
                    ty.value = withTiming(0);
                    return;
                }
                const s = DOUBLE_TAP_ZOOM;
                const qx = (e.x - cx - tx.value) / scale.value;
                const qy = (e.y - cy - ty.value) / scale.value;
                const limitX = panLimit(s, width, area.width);
                const limitY = panLimit(s, height, area.height);
                scale.value = withTiming(s);
                tx.value = withTiming(clampTo(e.x - cx - s * qx, -limitX, limitX));
                ty.value = withTiming(clampTo(e.y - cy - s * qy, -limitY, limitY));
            });

        const singleTap = Gesture.Tap().onEnd(e => {
            scheduleOnRN(handleTap, e.x, e.y, scale.value, tx.value, ty.value);
        });

        return Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));
    }, [area.width, area.height, width, height, cx, cy, handleTap, scale, tx, ty, start, drag]);

    const transformStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
    }));

    // Draw the selected pin last so it sits on top of its neighbours.
    const ordered = [...cities.filter(c => c.team !== selected), ...cities.filter(c => c.team === selected)];

    return (
        <GestureDetector gesture={gesture}>
            <View style={styles.zoomArea}>
                <Animated.View
                    style={[
                        styles.mapFrame,
                        { width, height, left: (area.width - width) / 2, top: (area.height - height) / 2 },
                        transformStyle,
                    ]}
                >
                    <Image
                        source={require('../../../assets/images/worked-map.png')}
                        style={{ width, height }}
                        resizeMode="stretch"
                    />
                </Animated.View>
                {ordered.map(city => (
                    <PinMarker
                        key={city.team}
                        city={city}
                        mapX={city.x * width - width / 2}
                        mapY={city.y * height - height / 2}
                        cx={cx}
                        cy={cy}
                        selected={city.team === selected}
                        scale={scale}
                        tx={tx}
                        ty={ty}
                    />
                ))}
                {zoomed && (
                    <TouchableOpacity
                        onPress={resetZoom}
                        style={styles.resetButton}
                        accessibilityRole="button"
                        accessibilityLabel="Zoom out"
                    >
                        <Ionicons name="contract" size={18} color="#fff" />
                    </TouchableOpacity>
                )}
            </View>
        </GestureDetector>
    );
}

type PinMarkerProps = {
    city: WorkedCity;
    /** The city's offset from the image centre, unzoomed. */
    mapX: number;
    mapY: number;
    cx: number;
    cy: number;
    selected: boolean;
    scale: SharedValue<number>;
    tx: SharedValue<number>;
    ty: SharedValue<number>;
};

/**
 * A pin laid out at its city on the unzoomed map (real left/top/size, so the
 * native view tree knows where it is), then shifted by just the zoom and pan:
 * c + t + s * q minus the unzoomed c + q. It isn't scaled itself, so it stays
 * sharp at any zoom. It used to be a zero-size view at the corner, placed
 * entirely by the animated transform with the icon overflowing it; that drew
 * in the simulator but the pins were missing on a device build.
 */
function PinMarker({ city, mapX, mapY, cx, cy, selected, scale, tx, ty }: PinMarkerProps) {
    const follow = useAnimatedStyle(() => ({
        transform: [
            { translateX: tx.value + (scale.value - 1) * mapX },
            { translateY: ty.value + (scale.value - 1) * mapY },
        ],
    }));
    const size = selected ? PIN_SELECTED : PIN;
    const tipY = size * PIN_TIP;
    return (
        <Animated.View
            pointerEvents="none"
            collapsable={false}
            style={[
                styles.marker,
                { left: cx + mapX - size / 2, top: cy + mapY - tipY, width: size, height: size },
                selected && styles.markerSelected,
                follow,
            ]}
        >
            <Ionicons
                name={city.worked > 0 ? 'location' : 'location-outline'}
                size={size}
                color={ORANGE}
                style={styles.pin}
            />
            {selected && (
                <View
                    style={[
                        styles.callout,
                        { top: tipY - 48 },
                        city.x > 0.7 ? { right: size / 2 + 16 } : { left: size / 2 + 16 },
                    ]}
                >
                    <Text style={styles.calloutCity} numberOfLines={1}>{city.city}</Text>
                    <Text style={styles.calloutMeta} numberOfLines={1}>{cityMeta(city)}</Text>
                </View>
            )}
        </Animated.View>
    );
}

function cityMeta(c: WorkedCity): string {
    const parts: string[] = [];
    if (c.worked > 0) parts.push(`${plural(c.worked, 'game')} worked`);
    if (c.upcoming > 0) parts.push(`${c.upcoming} upcoming`);
    return parts.join(' · ');
}

const ORANGE = '#ff6600';

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    box: {
        backgroundColor: '#000',
        paddingTop: 10,
        paddingBottom: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 6,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#1c1c1f',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        color: '#fff',
        fontSize: 17,
        fontWeight: 'bold',
    },
    chips: {
        flex: 1,
    },
    chipsContent: {
        gap: 8,
        paddingRight: 8,
    },
    chip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#333',
    },
    chipActive: {
        backgroundColor: ORANGE,
        borderColor: ORANGE,
    },
    chipText: {
        color: '#ccc',
        fontSize: 13,
    },
    chipTextActive: {
        color: '#000',
        fontWeight: 'bold',
    },
    body: {
        flex: 1,
        flexDirection: 'row',
        gap: 12,
    },
    mapArea: {
        flex: 1,
        overflow: 'hidden',
    },
    zoomArea: {
        flex: 1,
    },
    resetButton: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(28,28,31,0.9)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    mapFrame: {
        position: 'absolute',
    },
    marker: {
        position: 'absolute',
    },
    markerSelected: {
        zIndex: 2,
    },
    pin: {
        // Lifts the pin off the dark map.
        textShadowColor: 'rgba(0,0,0,0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    callout: {
        position: 'absolute',
        width: 170,
        backgroundColor: '#1c1c1f',
        borderColor: ORANGE,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    calloutCity: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    calloutMeta: {
        color: '#ccc',
        fontSize: 12,
        marginTop: 2,
    },
    empty: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        color: '#999',
        fontSize: 15,
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        overflow: 'hidden',
    },
    sidebar: {
        width: 190,
    },
    summaryBig: {
        color: ORANGE,
        fontSize: 34,
        fontWeight: 'bold',
        lineHeight: 38,
    },
    summaryLabel: {
        color: '#ccc',
        fontSize: 13,
        marginBottom: 8,
    },
    list: {
        flex: 1,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 6,
        borderRadius: 6,
        gap: 8,
    },
    rowSelected: {
        backgroundColor: '#1c1c1f',
    },
    rowCity: {
        flex: 1,
        color: '#fff',
        fontSize: 14,
    },
    rowCount: {
        color: '#ccc',
        fontSize: 14,
        fontVariant: ['tabular-nums'],
    },
    legend: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingTop: 6,
        paddingHorizontal: 6,
    },
    legendText: {
        color: '#999',
        fontSize: 12,
    },
});
