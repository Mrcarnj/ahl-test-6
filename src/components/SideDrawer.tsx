// The iPad's right-hand drawer: slides in from the right, closes from its X
// or by swiping it back off to the right. Used by the home screen's All Games
// panel and the Roster tab's official details. The caller positions it
// (`style`); this draws the header and handles the motion.

import React, { type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    SlideInRight,
    SlideOutRight,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** A swipe closes the drawer past this share of its width, or on a fast flick. */
const CLOSE_DISTANCE = 0.3;
const CLOSE_VELOCITY = 800;

type Props = {
    title: string;
    onClose: () => void;
    style?: StyleProp<ViewStyle>;
    children: ReactNode;
};

export default function SideDrawer({ title, onClose, style, children }: Props) {
    const translateX = useSharedValue(0);
    const width = useSharedValue(0);

    // Rightward only, and it gives way to vertical movement so the lists and
    // profiles inside still scroll.
    const swipe = Gesture.Pan()
        .activeOffsetX(15)
        .failOffsetY([-15, 15])
        .onUpdate((e) => {
            translateX.value = Math.max(0, e.translationX);
        })
        .onEnd((e) => {
            if (e.translationX > width.value * CLOSE_DISTANCE || e.velocityX > CLOSE_VELOCITY) {
                // Finish the slide off screen, then unmount; the exit
                // animation then plays off screen where it can't be seen.
                translateX.value = withTiming(width.value, { duration: 150 }, () => {
                    scheduleOnRN(onClose);
                });
            } else {
                translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
            }
        });

    const dragStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    return (
        <Animated.View
            style={[styles.drawer, style, dragStyle]}
            entering={SlideInRight.duration(250)}
            exiting={SlideOutRight.duration(200)}
            onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}
        >
            <GestureHandlerRootView style={styles.fill}>
                <GestureDetector gesture={swipe}>
                    <View style={styles.fill}>
                        <View style={styles.header}>
                            <Text style={styles.title}>{title}</Text>
                            <TouchableOpacity
                                onPress={onClose}
                                hitSlop={12}
                                accessibilityLabel={`Close ${title}`}
                            >
                                <Ionicons name="close" size={28} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        {children}
                    </View>
                </GestureDetector>
            </GestureHandlerRootView>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    drawer: {
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    fill: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    title: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
});
