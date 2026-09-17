/**
 * Shared scaffolding for every variant.
 *
 * Each variant renders the SAME screen and differs in exactly one thing: how the title handles
 * text scaling, or where its colours come from. Anything else that differed between builds would
 * make the pixel diffs meaningless.
 *
 * The fontScale readout in the corner is deliberate. It is how the pilot knows the accessibility
 * setting actually took effect in the build under test, rather than assuming the simctl write
 * landed.
 */
import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';

export const TITLE = 'Notifications';

export function Screen({
  title,
  palette,
}: {
  title: React.ReactNode;
  palette?: {bg: string; label: string; secondary: string; card: string};
}) {
  const scheme = useColorScheme();
  const {fontScale} = useWindowDimensions();
  const dark = scheme === 'dark';

  // The hand-maintained palette, used unless a variant supplies its own.
  const p =
    palette ??
    (dark
      ? {bg: '#000000', label: '#FFFFFF', secondary: '#98989F', card: '#1C1C1E'}
      : {bg: '#F2F2F7', label: '#000000', secondary: '#6C6C70', card: '#FFFFFF'});

  const [enabled, setEnabled] = React.useState(true);

  return (
    <SafeAreaView style={[styles.fill, {backgroundColor: p.bg}]}>
      <ScrollView contentContainerStyle={styles.content}>
        {title}

        <View style={[styles.card, {backgroundColor: p.card}]}>
          <View style={fontScale >= 1.5 ? styles.rowStacked : styles.row}>
            <Text style={[styles.rowLabel, {color: p.label}]}>Allow Notifications</Text>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              accessibilityRole="switch"
              accessibilityLabel="Allow Notifications"
            />
          </View>
        </View>

        <Text style={[styles.footnote, {color: p.secondary}]}>
          fontScale {fontScale.toFixed(3)} · {dark ? 'dark' : 'light'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export const styles = StyleSheet.create({
  fill: {flex: 1},
  content: {padding: 16, gap: 16},
  title: {fontSize: 34, fontWeight: '700'},
  card: {borderRadius: 12, padding: 16},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  rowStacked: {flexDirection: 'column', alignItems: 'flex-start', gap: 12},
  rowLabel: {fontSize: 17, flexShrink: 1},
  footnote: {fontSize: 13},
});
