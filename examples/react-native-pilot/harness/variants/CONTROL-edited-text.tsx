// CONTROL: identical to A except the title STRING.
//
// "The screenshot did not change" has two explanations: the prop did nothing, or the build never
// picked up the edit. This variant rules out the second. If this one does not differ from A, the
// pipeline is broken and every other result in this harness is meaningless.
import React from 'react';
import {Text} from 'react-native';
import {Screen, styles} from './_shared';

export default function App() {
  return (
    <Screen title={<Text style={styles.title} accessibilityRole="header">CONTROL MARKER</Text>} />
  );
}
