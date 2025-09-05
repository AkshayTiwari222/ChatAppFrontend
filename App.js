// App.js

import React, { useState, useEffect, createContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import HomeScreen from './screens/HomeScreen';
import ChatScreen from './screens/ChatScreen';

// Create a context for authentication
export const AuthContext = createContext();

const Stack = createNativeStackNavigator();

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for stored user token on app startup
  useEffect(() => {
    const bootstrapAsync = async () => {
      let userToken;
      try {
        userToken = await AsyncStorage.getItem('userToken');
        const userData = await AsyncStorage.getItem('userData');
        if (userToken && userData) {
          setUser(JSON.parse(userData));
        }
      } catch (e) {
        console.error('Restoring token failed', e);
      }
      setLoading(false);
    };

    bootstrapAsync();
  }, []);

  const authContext = {
    signIn: async (data) => {
      setUser(data.user);
      await AsyncStorage.setItem('userToken', data.token);
      await AsyncStorage.setItem('userData', JSON.stringify(data.user));
    },
    signOut: async () => {
      setUser(null);
      await AsyncStorage.removeItem('userToken');
      await AsyncStorage.removeItem('userData');
    },
    user,
  };

  if (loading) {
    // We can show a splash screen here
    return null;
  }

  return (
    <AuthContext.Provider value={authContext}>
      <NavigationContainer>
        <Stack.Navigator>
          {user ? (
            // User is signed in
            <>
              <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Chats' }} />
              <Stack.Screen 
                name="Chat" 
                component={ChatScreen} 
                options={({ route }) => ({ title: route.params.username })}
              />
            </>
          ) : (
            // No user found, show auth screens
            <>
              <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
};

export default App;
