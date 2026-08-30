import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';

import App from './App';

// BUG FIX (black/blank screen during Splash -> Login/Dashboard startup):
// preventAutoHideAsync() was never called anywhere in this codebase.
// Without it, the native Android splash screen can auto-hide on its own
// native-default timing, independent of whether the JS bundle has finished
// loading, fonts have loaded, or MerchantContext's async session-restore
// check has completed. Whatever the very next frame happens to be at that
// moment (before Theme/styles/fonts are fully ready) gets exposed as a
// flash of black/blank — a non-deterministic race, which is why it was
// intermittent rather than 100% reproducible.
//
// This call must run here, at module scope, before registerRootComponent
// — i.e. before React even starts rendering — so native Android is told
// to KEEP the splash up and wait for an explicit App.tsx-driven
// hideAsync() call once the real UI (Login or Dashboard) is actually
// ready to be shown. See App.tsx for the corresponding hideAsync() call,
// which now waits for MerchantProvider's isLoading to become false instead
// of firing unconditionally on first mount.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Only throws if called after the splash was already auto-hidden by a
  // prior JS reload in dev — safe to ignore in that case.
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
