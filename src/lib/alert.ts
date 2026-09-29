// src/lib/alert.ts
//
// Native re-export of React Native's Alert. The web build swaps in alert.web.ts,
// because react-native-web ships `Alert.alert` as a silent no-op — without this
// shim every confirmation and error message would simply never appear.

import { Alert } from 'react-native';

export { Alert };
export default Alert;
