import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ViewStyle } from 'react-native';

interface SafeAreaWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  backgroundColor?: string;
}

export const SafeAreaWrapper: React.FC<SafeAreaWrapperProps> = ({
  children,
  style,
  edges = ['top', 'left', 'right'],
  backgroundColor = '#FAF7F2' // Matches Tamagui earthy-sport-light theme background
}) => {
  return (
    <SafeAreaView 
      style={[
        { 
          flex: 1, 
          backgroundColor 
        }, 
        style
      ]} 
      edges={edges}
    >
      {children}
    </SafeAreaView>
  );
}; 