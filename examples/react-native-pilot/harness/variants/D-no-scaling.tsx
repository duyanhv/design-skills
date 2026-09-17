// D: turn scaling off for this one Text and choose the size. Works, at a real accessibility cost:
// a user who needs larger text does not get it here. Use only for display text, never body text.
import React from 'react';
import {Text} from 'react-native';
import {Screen, TITLE, styles} from './_shared';

export default function App() {
  return (
    <Screen
      title={
        <Text
          style={[styles.title, {fontSize: 34}]}
          accessibilityRole="header"
          allowFontScaling={false}>
          {TITLE}
        </Text>
      }
    />
  );
}
