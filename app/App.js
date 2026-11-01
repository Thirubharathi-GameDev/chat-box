import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { ChatScreen } from './src/screens/ChatScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { NameScreen } from './src/screens/NameScreen';
import { ChatProvider } from './src/state/ChatContext';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();

function Routes() {
  const { ready, token, user } = useAuth();

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.white} />
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
        </>
      ) : null}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ChatProvider>
          <NavigationContainer>
            <StatusBar style="light" />
            <Routes />
          </NavigationContainer>
        </ChatProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.header,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
