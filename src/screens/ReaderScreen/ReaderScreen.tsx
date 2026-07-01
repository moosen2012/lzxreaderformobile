import React from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { ReaderContent } from '../../components/Reader/ReaderContent';

type RootStackParamList = {
  Home: undefined;
  Reader: { fileId: string };
};

interface ReaderScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Reader'>;
  route: RouteProp<RootStackParamList, 'Reader'>;
}

export const ReaderScreen: React.FC<ReaderScreenProps> = ({ navigation, route }) => {
  const fileId = route.params?.fileId;

  return (
    <ReaderContent
      fileId={fileId}
      onBack={() => navigation.goBack()}
      isEmbedded={false}
    />
  );
};
