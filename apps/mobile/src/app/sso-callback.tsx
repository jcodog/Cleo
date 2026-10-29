import { Redirect } from "expo-router"
/** Return the native SSO deep link to the root session gate. */
export default function Callback() {
  return <Redirect href="/" />
}
