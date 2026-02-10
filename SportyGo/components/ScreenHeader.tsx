import React from 'react';
import { YStack, XStack, Text, Button } from 'tamagui';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  centerTitle?: boolean;
  backgroundColor?: any;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  onBack,
  right,
  centerTitle = false,
  backgroundColor = '$color1',
}) => {
  return (
    <YStack bg={backgroundColor} px="$4" py="$3" borderBottomWidth={1} borderColor="$borderColor">
      <XStack verticalAlign="center" justify="space-between">
        <XStack verticalAlign="center" minW={64} >
          {onBack ? (
            <Button
              bg="$color2"
              borderColor="$borderColor"
              borderWidth={1}
              onPress={onBack}
              px="$3"
              py="$2"
            >
              <Text color="$color">← Back</Text>
            </Button>
          ) : (
            <YStack width={0} />
          )}
        </XStack>

        <YStack flex={1} px="$3" style={{ alignItems: centerTitle ? 'center' : 'flex-start' }}>
          <Text color="$color" style={{ fontSize: 22, fontWeight: 'bold' }}>{title}</Text>
          {subtitle ? (
            <Text color="$color10" style={{ fontSize: 14, marginTop: 2 }}>{subtitle}</Text>
          ) : null}
        </YStack>

        <XStack verticalAlign="center" justify="flex-end" minW={64}>
          {right}
        </XStack>
      </XStack>
    </YStack>
  );
}; 