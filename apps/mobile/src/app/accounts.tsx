import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Plus, RefreshCw } from 'lucide-react-native';
import { formatDate, formatINR, formatTime, type AccountDTO, type ConsentDTO } from '@finance-buddy/core';
import { errorMessage } from '@/lib/api';
import { onboardingApi, useAccounts, useInvalidateFinance, useSync } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Button } from '@/ui/controls';
import { FipMark, ListRow } from '@/ui/display';
import { BackHeader, Banner, ErrorState, FadeIn, LoadingState, Screen, Sheet } from '@/ui/layout';
import { Badge, Card, Divider, Row, SectionTitle, T } from '@/ui/primitives';

const SHORT_TYPE: Record<AccountDTO['type'], string> = { SAVINGS: 'Savings', CURRENT: 'Current', TERM_DEPOSIT: 'Fixed deposit', MUTUAL_FUNDS: 'Mutual funds', EPF: 'EPF' };

/** Connected accounts and consent management (Blueprint §23: visible, revocable consent). */
export default function AccountsScreen() {
  const { c } = useTheme();
  const q = useAccounts();
  const sync = useSync();
  const invalidate = useInvalidateFinance();
  const [revoking, setRevoking] = useState<ConsentDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = q.data;
  const banks = d?.accounts.filter((a) => a.type === 'SAVINGS' || a.type === 'CURRENT') ?? [];
  const others = d?.accounts.filter((a) => !(a.type === 'SAVINGS' || a.type === 'CURRENT')) ?? [];
  const consents = (d?.consents ?? []).filter((x) => x.status !== 'REJECTED');

  const status = (a: AccountDTO) =>
    a.syncStatus === 'FAILED' ? <Badge label="Sync failed" tone="negative" /> : a.reconciliation?.status === 'MISMATCH' ? <Badge label="Balance mismatch" tone="warning" /> : a.consentStatus === 'REVOKED' ? <Badge label="Revoked" /> : null;

  return (
    <Screen
      edges={['top', 'bottom']}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      footer={
        <Row gap={space.md}>
          <Button label="Refresh data" icon={RefreshCw} variant="outline" style={{ flex: 1 }} loading={sync.isPending} onPress={() => sync.mutate()} />
          <Button label="Add accounts" icon={Plus} style={{ flex: 1 }} onPress={() => router.push('/onboarding/discover')} />
        </Row>
      }
    >
      <BackHeader title="Accounts" />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !d ? (
        <LoadingState />
      ) : (
        <FadeIn>
          <Card muted>
            <T v="small" tone="secondary">
              Total in bank accounts
            </T>
            <T v="amount">{formatINR(d.totalCash)}</T>
          </Card>
          {sync.error ? (
            <View style={{ marginTop: space.md }}>
              <Banner tone="negative" title={errorMessage(sync.error)} />
            </View>
          ) : null}
          {banks.some((a) => a.syncStatus === 'FAILED') ? (
            <View style={{ marginTop: space.md }}>
              <Banner tone="warning" title="Some accounts didn't sync" body="Their balances may be out of date. Refresh to retry." action="Retry" onAction={() => sync.mutate()} />
            </View>
          ) : null}
          {[
            { title: 'Bank accounts', list: banks },
            { title: 'Investments & savings', list: others },
          ]
            .filter((g) => g.list.length)
            .map((g) => (
              <View key={g.title} style={{ marginTop: space.xl }}>
                <SectionTitle>{g.title}</SectionTitle>
                {g.list.map((a, i) => (
                  <View key={a.id}>
                    {i > 0 ? <Divider inset={48} /> : null}
                    <ListRow
                      left={<FipMark fip={a.fip} size={36} />}
                      title={`${a.fip.shortName} •••• ${a.maskedNumber.slice(-4)}`}
                      subtitle={a.lastSyncedAt ? `${SHORT_TYPE[a.type]} · synced ${formatDate(a.lastSyncedAt).replace(/ \d{4}$/, '')}, ${formatTime(a.lastSyncedAt)}` : SHORT_TYPE[a.type]}
                      right={<T v="bodySemibold">{formatINR(a.balance, { decimals: a.type === 'SAVINGS' ? 2 : 0 })}</T>}
                      rightSub={status(a)}
                    />
                  </View>
                ))}
              </View>
            ))}
          {d.accounts.length === 0 ? <Banner tone="info" title="No accounts connected" body="Add accounts to see balances, activity and insights." /> : null}

          <View style={{ marginTop: space.xxl }}>
            <SectionTitle>Consents</SectionTitle>
            <T v="small" tone="secondary" style={{ marginBottom: space.md }}>
              Data is shared only through your Account Aggregator, with your approval. Revoking stops sharing and removes that data from Finance Buddy.
            </T>
            {consents.length === 0 ? (
              <T v="small" tone="tertiary">
                No consents yet.
              </T>
            ) : (
              consents.map((x) => (
                <Card key={x.id} style={{ marginBottom: space.md }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T v="bodySemibold">{`${x.accounts.length} account${x.accounts.length === 1 ? '' : 's'}`}</T>
                    <Badge label={x.status === 'ACTIVE' ? 'Active' : x.status === 'PENDING' ? 'Waiting for approval' : x.status.charAt(0) + x.status.slice(1).toLowerCase()} tone={x.status === 'ACTIVE' ? 'positive' : x.status === 'PENDING' ? 'warning' : 'secondary'} />
                  </Row>
                  <Row gap={6} style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
                    {x.accounts.map((a) => (
                      <FipMark key={a.id} fip={a.fip} size={22} />
                    ))}
                  </Row>
                  <T v="small" tone="secondary" style={{ marginTop: space.sm }}>
                    {x.dataShared.join(' · ')}
                  </T>
                  <T v="caption" tone="tertiary" style={{ marginTop: 4 }}>{`${x.frequency} · valid till ${formatDate(x.expiresAt)} · via ${x.provider === 'mock' ? 'AA sandbox' : x.provider}`}</T>
                  {x.status === 'ACTIVE' || x.status === 'PENDING' ? (
                    <Button label="Revoke consent" variant="danger" size="sm" style={{ marginTop: space.md, alignSelf: 'flex-start' }} onPress={() => setRevoking(x)} />
                  ) : null}
                </Card>
              ))
            )}
          </View>
        </FadeIn>
      )}

      <Sheet
        visible={!!revoking}
        onClose={() => setRevoking(null)}
        title="Revoke this consent?"
        footer={
          <View style={{ gap: space.sm }}>
            {error ? <Banner tone="negative" title={error} /> : null}
            <Button
              label="Revoke and remove data"
              variant="danger"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                setError(null);
                try {
                  await onboardingApi.revoke(revoking!.id);
                  await invalidate();
                  setRevoking(null);
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Button label="Cancel" variant="ghost" onPress={() => setRevoking(null)} />
          </View>
        }
      >
        <T v="body" tone="secondary">
          {`Finance Buddy will stop receiving data from ${revoking?.accounts.map((a) => `${a.fip.shortName} ••${a.maskedNumber.slice(-4)}`).join(', ')} and delete the transactions and balances it fetched.`}
        </T>
        <T v="small" tone="tertiary" style={{ marginTop: space.md }}>
          You can reconnect any time.
        </T>
      </Sheet>
      <View style={{ height: 1, backgroundColor: c.bg }} />
    </Screen>
  );
}
