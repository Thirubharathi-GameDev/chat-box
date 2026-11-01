import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { AppLockProvider } from './src/components/AppLock';
import { ChatScreen } from './src/screens/ChatScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { NameScreen } from './src/screens/NameScreen';
import { PartnerScreen } from './src/screens/PartnerScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { StarredScreen } from './src/screens/StarredScreen';
import { ChatProvider } from './src/state/ChatContext';
import { ThemeProvider, useColors } from './src/theme';

const Stack = createNativeStackNavigator();

function Routes() {
  const { ready, token, user } = useAuth();
  const colors = useColors();

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.onHeader} />
      </View>
    );
  }

  const mode = !token ? 'auth' : !user?.displayName ? 'name' : 'app';

  return (
    <Stack.Navigator key={mode} screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      {mode === 'auth' ? <Stack.Screen name="Login" component={LoginScreen} /> : null}
      {mode === 'name' ? <Stack.Screen name="Name" component={NameScreen} /> : null}
      {mode === 'app' ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Starred" component={StarredScreen} />
          <Stack.Screen name="Partner" component={PartnerScreen} />
        </>
      ) : null}
    </Stack.Navigator>
  );
}

function Root() {
  const colors = useColors();
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.onHeader} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Routes />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppLockProvider>
            <ChatProvider>
              <Root />
            </ChatProvider>
          </AppLockProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
