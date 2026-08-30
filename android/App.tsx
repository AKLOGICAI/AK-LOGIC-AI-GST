import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { useFonts } from 'expo-font';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { Ionicons, FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Theme } from './lib/theme';
import { MerchantProvider, useMerchant } from './lib/MerchantContext';

// Screens
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import RequestsScreen from './screens/RequestsScreen';
import InvoiceHistoryScreen from './screens/InvoiceHistoryScreen';
import InvoiceCreateScreen from './screens/InvoiceCreateScreen';
import QRScreen from './screens/QRScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import MoreScreen from './screens/MoreScreen';
import PurchaseBillsScreen from './screens/PurchaseBillsScreen';
import AccountingScreen from './screens/AccountingScreen';
import GstReturnCenterScreen from './screens/GstReturnCenterScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import InventoryScreen from './screens/InventoryScreen';
import AddressBookScreen from './screens/AddressBookScreen';
import MerchantNetworkScreen from './screens/MerchantNetworkScreen';
import WebsiteBuilderScreen from './screens/WebsiteBuilderScreen';
import ReportsScreen from './screens/ReportsScreen';
import RechargeScreen from './screens/RechargeScreen';
import SettingsScreen from './screens/SettingsScreen';
import ChatScreen from './screens/ChatScreen';
import ProfileScreen from './screens/ProfileScreen';
import SupportScreen from './screens/SupportScreen';
import UIStatesScreen from './screens/UIStatesScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Keep native splash screen visible while fonts and auth session load
ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

function NavIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 64, height: 32, borderRadius: 16, backgroundColor: focused ? Theme.primaryContainer : 'transparent' }}>
      <MaterialIcons name={name as any} size={24} color={color} />
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: Theme.surface2, borderTopColor: Theme.outlineVariant, borderTopWidth: 1, height: Theme.navBarHeight, paddingBottom: 10, paddingTop: 6, elevation: 3 },
      tabBarActiveTintColor: Theme.onSurface,
      tabBarInactiveTintColor: Theme.onSurfaceVariant,
      tabBarLabelStyle: { fontSize: Theme.labelSmall, fontWeight: '500', marginTop: 4 },
    }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: ({ color, focused }) => <NavIcon name="home" color={color} focused={focused} /> }} />
      <Tab.Screen name="Requests" component={RequestsScreen} options={{ tabBarLabel: 'Requests', tabBarIcon: ({ color, focused }) => <NavIcon name="receipt-long" color={color} focused={focused} /> }} />
      <Tab.Screen name="QR" component={QRScreen} options={{ tabBarLabel: 'My QR', tabBarIcon: ({ color, focused }) => <NavIcon name="qr-code-scanner" color={color} focused={focused} /> }} />
      <Tab.Screen name="Invoices" component={InvoiceHistoryScreen} options={{ tabBarLabel: 'Invoices', tabBarIcon: ({ color, focused }) => <NavIcon name="description" color={color} focused={focused} /> }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ tabBarLabel: 'Menu', tabBarIcon: ({ color, focused }) => <NavIcon name="grid-view" color={color} focused={focused} /> }} />
    </Tab.Navigator>
  );
}

function MainNavigation() {
  const { isLoggedIn, isLoading } = useMerchant();

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: Theme.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={Theme.primary} /></View>;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Theme.bg },
          animation: 'slide_from_right',
          animationDuration: 220,
        }}
      >
        {!isLoggedIn ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="InvoiceCreate" component={InvoiceCreateScreen} />
            <Stack.Screen name="QR" component={QRScreen} />
            <Stack.Screen name="Requests" component={RequestsScreen} />
            <Stack.Screen name="InvoiceHistory" component={InvoiceHistoryScreen} />
            <Stack.Screen name="GstReturnCenter" component={GstReturnCenterScreen} />
            <Stack.Screen name="Analytics" component={AnalyticsScreen} />
            <Stack.Screen name="AddressBook" component={AddressBookScreen} />
            <Stack.Screen name="PurchaseBills" component={PurchaseBillsScreen} />
            <Stack.Screen name="Accounting" component={AccountingScreen} />
            <Stack.Screen name="Inventory" component={InventoryScreen} />
            <Stack.Screen name="MerchantNetwork" component={MerchantNetworkScreen} />
            <Stack.Screen name="WebsiteBuilder" component={WebsiteBuilderScreen} />
            <Stack.Screen name="Reports" component={ReportsScreen} />
            <Stack.Screen name="Recharge" component={RechargeScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Support" component={SupportScreen} />
            <Stack.Screen name="UIStates" component={UIStatesScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function AppShell() {
  const { isLoading } = useMerchant();
  const splashHidden = useRef(false);

  const [fontsLoaded, fontError] = useFonts({
    ...(Ionicons as any).font,
    ...(FontAwesome as any).font,
    ...(MaterialIcons as any).font,
  });

  useEffect(() => {
    // Hide native splash screen once fonts are ready AND session restoration completes
    if ((fontsLoaded || fontError) && !isLoading && !splashHidden.current) {
      splashHidden.current = true;
      ExpoSplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError, isLoading]);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: Theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Theme.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Theme.bg }} edges={['top', 'bottom', 'left', 'right']}>
      <MainNavigation />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MerchantProvider>
        <StatusBar style="light" />
        <AppShell />
      </MerchantProvider>
    </SafeAreaProvider>
  );
}
