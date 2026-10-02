import { useLocalSearchParams } from 'expo-router';
import { TransactionDetail } from '@/features/TransactionDetail';
import { BackHeader, Screen } from '@/ui/layout';

export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader />
      <TransactionDetail id={id} />
    </Screen>
  );
}
