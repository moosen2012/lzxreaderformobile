import React from 'react';
import { NavigationContainer, DarkTheme as NavDarkTheme, DefaultTheme as NavDefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useReaderStore } from '../store/readerStore';
import { getTheme } from '../styles/themes';
import { HomeScreen } from '../screens/HomeScreen/HomeScreen';
import { ReaderScreen } from '../screens/ReaderScreen/ReaderScreen';

export type RootStackParamList = {
  Home: undefined;
  Reader: { fileId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const themeMode = useReaderStore((state) => state.theme);
  const theme = getTheme(themeMode);

  const navTheme = {
    ...(themeMode === 'dark' ? NavDarkTheme : NavDefaultTheme),
    colors: {
      ...(themeMode === 'dark' ? NavDarkTheme : NavDefaultTheme).colors,
      primary: theme.primary,
      background: theme.background,
      card: theme.headerBackground,
      text: theme.text,
      border: theme.separator,
      notification: theme.danger,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Reader" component={ReaderScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
