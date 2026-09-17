// A: baseline. Default scaling, no cap. At AX5 the title wraps mid-word.
import React from 'react';
import {Text} from 'react-native';
import {Screen, TITLE, styles} from './_shared';

export default function App() {
  return <Screen title={<Text style={styles.title} accessibilityRole="header">{TITLE}</Text>} />;
}
