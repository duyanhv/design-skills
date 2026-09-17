// C: capping the fontSize by hand. This compounds: RN scales the value you computed,
// so multiplying by fontScale yourself applies the scale twice.
import React from 'react';
import {Text, useWindowDimensions} from 'react-native';
import {Screen, TITLE, styles} from './_shared';

export default function App() {
  const {fontScale} = useWindowDimensions();
  const size = Math.min(34 * fontScale, 34 * 1.4);
  return (
    <Screen
      title={
        <Text style={[styles.title, {fontSize: size}]} accessibilityRole="header">
          {TITLE}
        </Text>
      }
    />
  );
}
