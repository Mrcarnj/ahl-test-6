import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type GameChangeAlertData = {
  title: string;
  body: string;
  /** Omitted for summaries of several games; hides the "View Crew" button. */
  gameId?: string;
  /** Replaces "View Crew" with another destination (e.g. a game's clips). */
  action?: { label: string; href: string };
  /** Label for the dismiss button. Defaults to "Okay". */
  dismissLabel?: string;
  /** Identifies the alert for de-duplication (e.g. `clip:<id>`). */
  key?: string;
};

type Props = {
  alert: GameChangeAlertData | null;
  onDismiss: () => void;
  onViewCrew: (gameId: string) => void;
  onAction: (href: string) => void;
};

/**
 * Blocking pop-up for a game change that arrives while the app is open, or
 * that a background schedule sync found.
 * There is deliberately no backdrop-tap dismissal: the official has to
 * acknowledge it with "Okay" or jump to the game with "View Crew".
 */
export default function GameChangeAlert({ alert, onDismiss, onViewCrew, onAction }: Props) {
  return (
    <Modal
      visible={alert !== null}
      transparent
      animationType="fade"
      // Android hardware back acts as "Okay".
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{alert?.title}</Text>
          <Text style={styles.body}>{alert?.body}</Text>

          <Pressable
            style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
            onPress={onDismiss}
          >
            <Text style={styles.primaryText}>{alert?.dismissLabel ?? 'Okay'}</Text>
          </Pressable>

          {alert?.action ? (
            <Pressable
              style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
              onPress={() => alert.action && onAction(alert.action.href)}
            >
              <Text style={styles.secondaryText}>{alert.action.label}</Text>
            </Pressable>
          ) : alert?.gameId ? (
            <Pressable
              style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
              onPress={() => alert.gameId && onViewCrew(alert.gameId)}
            >
              <Text style={styles.secondaryText}>View Crew</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#333',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    color: '#ccc',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: '#ff6600',
  },
  secondary: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ff6600',
  },
  pressed: {
    opacity: 0.7,
  },
  primaryText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryText: {
    color: '#ff6600',
    fontSize: 16,
    fontWeight: '600',
  },
});
