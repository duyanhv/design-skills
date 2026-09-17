// B: the prop that looks like the answer. On Fabric iOS it is accepted and ignored.
// Compare against A: if the capture is pixel-identical, the prop did nothing.
import React from 'react';
import {Text} from 'react-native';
import {Screen, TITLE, styles} from './_shared';

export default function App() {
  return (
    <Screen
      title={
        <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          {TITLE}
        </Text>
      }
    />
  );
}
