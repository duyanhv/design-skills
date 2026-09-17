/**
 * Notification settings, React Native.
 *
 * The same task the SwiftUI build exercise used, so the two are comparable. Written to exercise the
 * places where React Native differs from SwiftUI rather than to look like SwiftUI in JSX.
 */
import React, {useMemo, useState} from 'react';
import {
  AccessibilityInfo,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';

type Delivery = 'off' | 'quiet' | 'immediate';

const CATEGORIES = [
  {id: 'mentions', title: 'Mentions', detail: 'When someone names you in a conversation.'},
  {id: 'dms', title: 'Direct Messages', detail: 'Messages sent only to you.'},
  {id: 'updates', title: 'Product Updates', detail: 'New features and release notes.'},
] as const;

const DELIVERY_OPTIONS: {value: Delivery; label: string; a11y: string}[] = [
  {value: 'off', label: 'Off', a11y: 'Off, no notifications'},
  {value: 'quiet', label: 'Quiet', a11y: 'Quiet, delivered silently'},
  {value: 'immediate', label: 'Immediate', a11y: 'Immediate, delivered with a sound'},
];

export default function NotificationSettings() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const c = dark ? palette.dark : palette.light;
  // RN has no Dynamic Type equivalent: fontScale is the closest signal, and it is the app's job to
  // react to it. This is the main structural difference from SwiftUI, where the system scales text.
  const {fontScale} = useWindowDimensions();
  const stacked = fontScale >= 1.5;


  const [enabled, setEnabled] = useState(true);
  const [delivery, setDelivery] = useState<Record<string, Delivery>>({
    mentions: 'immediate',
    dms: 'immediate',
    updates: 'quiet',
  });
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const immediateCount = useMemo(
    () => Object.values(delivery).filter(d => d === 'immediate').length,
    [delivery],
  );

  const sendTest = () => {
    if (sending) {
      return;
    }
    setSending(true);
    setTimeout(() => {
      setSending(false);
      // An announcement is the RN equivalent of telling VoiceOver something changed; without it a
      // screen-reader user gets no feedback that the action completed.
      AccessibilityInfo.announceForAccessibility('Test notification sent');
      Alert.alert('Test sent', 'If nothing arrives, check Settings for this app.');
    }, 1200);
  };

  return (
    <SafeAreaView style={[styles.fill, {backgroundColor: c.groupedBackground}]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text
          accessibilityRole="header"
          // At AX5 fontScale is 3.571, so an uncapped 34pt title renders at ~121pt and wraps
          // mid-word. Two things that do NOT fix it, both verified on device:
          //   maxFontSizeMultiplier - declared in TextProps, no native implementation here, no-op
          //   an inline fontSize    - RN scales that too, so the cap compounds instead of capping
          // Turning scaling off for this one Text, and choosing the size ourselves, is what works.
          // Body text below stays scalable; only the display title is pinned.
          allowFontScaling={false}
          style={[styles.title, {color: c.label, fontSize: stacked ? 28 : 34}]}>
          Notifications
        </Text>

        <View style={[styles.card, {backgroundColor: c.card}]}>
          <View style={[styles.row, stacked && styles.rowStacked]}>
            <Text style={[styles.rowLabel, {color: c.label}]}>Allow Notifications</Text>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              accessibilityLabel="Allow notifications"
            />
          </View>
        </View>

        {enabled && (
          <>
            <Text style={[styles.sectionHeader, {color: c.secondaryLabel}]} accessibilityRole="header">
              Categories
            </Text>
            <View style={[styles.card, {backgroundColor: c.card}]}>
              {CATEGORIES.map((category, index) => (
                <View
                  key={category.id}
                  style={[
                    styles.categoryRow,
                    index > 0 && {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator},
                  ]}>
                  <Text style={[styles.rowLabel, {color: c.label}]}>{category.title}</Text>
                  <Text style={[styles.detail, {color: c.secondaryLabel}]}>{category.detail}</Text>

                  {/* A segmented control is not built in. This is a row of Pressables with the
                      radiogroup semantics supplied by hand, which SwiftUI's Picker gives for free. */}
                  <View
                    style={[styles.segment, stacked && styles.segmentStacked, {backgroundColor: c.fill}]}
                    accessibilityRole="radiogroup"
                    accessibilityLabel={`${category.title} delivery`}>
                    {DELIVERY_OPTIONS.map(option => {
                      const selected = delivery[category.id] === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => setDelivery(d => ({...d, [category.id]: option.value}))}
                          accessibilityRole="radio"
                          accessibilityState={{selected}}
                          accessibilityLabel={option.a11y}
                          // hitSlop is the RN answer to a visually small control: the touch region
                          // grows without changing layout. There is no SwiftUI contentShape here.
                          hitSlop={8}
                          style={({pressed}) => [
                            styles.segmentItem,
                            stacked && styles.segmentItemStacked,
                            selected && {backgroundColor: c.card},
                            pressed && {opacity: 0.6},
                          ]}>
                          <Text
                            style={[styles.segmentLabel, {color: selected ? c.label : c.secondaryLabel}]}
                            numberOfLines={1}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
            <Text style={[styles.footer, {color: c.secondaryLabel}]}>
              {immediateCount} of {CATEGORIES.length} categories deliver immediately.
            </Text>

            <Text style={[styles.sectionHeader, {color: c.secondaryLabel}]} accessibilityRole="header">
              Invite
            </Text>
            <View style={[styles.card, {backgroundColor: c.card}]}>
              <View style={[styles.inviteRow, stacked && styles.inviteRowStacked]}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  placeholderTextColor={c.placeholder}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  accessibilityLabel="Email address to invite"
                  style={[
                    styles.input,
                    stacked && styles.inputStacked,
                    {color: c.label, borderColor: error ? c.danger : c.separator},
                  ]}
                />
                <Pressable
                  onPress={() => {
                    if (!email.includes('@')) {
                      setError('Enter a complete email address.');
                      return;
                    }
                    setError(null);
                    setEmail('');
                  }}
                  disabled={email.length === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Send invitation"
                  accessibilityState={{disabled: email.length === 0}}
                  style={({pressed}) => [
                    styles.sendButton,
                    stacked && styles.sendButtonStacked,
                    {backgroundColor: email.length === 0 ? c.fill : c.accent},
                    pressed && {opacity: 0.8},
                  ]}>
                  <Text
                    style={[styles.sendLabel, {color: email.length === 0 ? c.secondaryLabel : '#fff'}]}
                    numberOfLines={1}>
                    Send
                  </Text>
                </Pressable>
              </View>
              {error && (
                <Text style={[styles.error, {color: c.danger}]} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              )}
            </View>
          </>
        )}

        <Pressable
          onPress={sendTest}
          disabled={sending || !enabled}
          accessibilityRole="button"
          accessibilityLabel={sending ? 'Sending test notification' : 'Send test notification'}
          accessibilityState={{disabled: sending || !enabled, busy: sending}}
          style={({pressed}) => [
            styles.testButton,
            {backgroundColor: c.card, opacity: sending || !enabled ? 0.5 : pressed ? 0.8 : 1},
          ]}>
          <Text style={[styles.testLabel, {color: c.accent}]}>
            {sending ? 'Sending Test…' : 'Send Test Notification'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const palette = {
  light: {
    groupedBackground: '#F2F2F7',
    card: '#FFFFFF',
    label: '#000000',
    secondaryLabel: '#6C6C70',
    separator: '#C6C6C8',
    fill: '#E9E9EB',
    accent: '#007AFF',
    danger: '#D70015',
    placeholder: '#A1A1A6',
  },
  dark: {
    groupedBackground: '#000000',
    card: '#1C1C1E',
    label: '#FFFFFF',
    secondaryLabel: '#98989F',
    separator: '#38383A',
    fill: '#2C2C2E',
    accent: '#0A84FF',
    danger: '#FF453A',
    placeholder: '#6C6C70',
  },
};

const styles = StyleSheet.create({
  fill: {flex: 1},
  content: {padding: 16, paddingBottom: 48},
  title: {fontSize: 34, fontWeight: '700', marginBottom: 16},
  sectionHeader: {fontSize: 13, fontWeight: '600', marginTop: 24, marginBottom: 8, marginLeft: 4},
  card: {borderRadius: 12, overflow: 'hidden'},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, minHeight: 44},
  // A label beside a fixed-width control has nowhere to grow; stack them once text is large.
  rowStacked: {flexDirection: 'column', alignItems: 'flex-start', gap: 12},
  rowLabel: {fontSize: 17, flexShrink: 1},
  detail: {fontSize: 13, marginTop: 2},
  categoryRow: {padding: 16},
  segment: {flexDirection: 'row', borderRadius: 9, padding: 2, marginTop: 12},
  segmentStacked: {flexDirection: 'column'},
  segmentItem: {flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 7, paddingHorizontal: 8},
  segmentItemStacked: {minHeight: 44, width: '100%'},
  segmentLabel: {fontSize: 15},
  footer: {fontSize: 13, marginTop: 8, marginLeft: 4},
  inviteRow: {flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8},
  inviteRowStacked: {flexDirection: 'column', alignItems: 'stretch'},
  input: {flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 17},
  inputStacked: {flex: 0, width: '100%'},
  sendButton: {minHeight: 44, minWidth: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingHorizontal: 16},
  sendButtonStacked: {width: '100%'},
  sendLabel: {fontSize: 17, fontWeight: '600'},
  error: {fontSize: 13, paddingHorizontal: 12, paddingBottom: 12},
  testButton: {marginTop: 24, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12},
  testLabel: {fontSize: 17, fontWeight: '600'},
});
