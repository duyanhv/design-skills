// E: the option the pilot's first pass missed entirely.
//
// Fabric routes dynamicTypeRamp through UIFontMetrics, which is the same mechanism SwiftUI's
// semantic text styles use. Unlike D it keeps scaling ON: the text still grows for users who need
// it, but along Apple's curve for that style rather than a raw multiplier.
//
// Test this BEFORE reaching for allowFontScaling={false}.
import React from 'react';
import {Text} from 'react-native';
import {Screen, TITLE, styles} from './_shared';

export default function App() {
  return (
    <Screen
      title={
        <Text style={styles.title} accessibilityRole="header" dynamicTypeRamp="largeTitle">
          {TITLE}
        </Text>
      }
    />
  );
}
