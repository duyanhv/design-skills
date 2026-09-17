// F: the other thing the first pass missed. RN DOES expose iOS semantic colours, so a
// hand-maintained palette is a choice rather than a necessity.
//
// PlatformColor resolves to the real UIColor, so it adapts to appearance AND to increased
// contrast, which a hard-coded hex cannot do.
import React from 'react';
import {DynamicColorIOS, PlatformColor, Text} from 'react-native';
import {Screen, TITLE, styles} from './_shared';

export default function App() {
  return (
    <Screen
      palette={{
        bg: PlatformColor('systemGroupedBackgroundColor') as unknown as string,
        label: PlatformColor('labelColor') as unknown as string,
        secondary: PlatformColor('secondaryLabelColor') as unknown as string,
        // DynamicColorIOS is the escape hatch when you need a brand colour to adapt.
        card: DynamicColorIOS({light: '#FFFFFF', dark: '#1C1C1E'}) as unknown as string,
      }}
      title={
        <Text
          style={[styles.title, {color: PlatformColor('labelColor')}]}
          accessibilityRole="header"
          dynamicTypeRamp="largeTitle">
          {TITLE}
        </Text>
      }
    />
  );
}
