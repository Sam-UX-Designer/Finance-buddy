import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { ConsentDTO, DiscoveredAccountDTO } from '@moneymate/core';
import { onboardingApi } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Button } from '@/ui/controls';
import { FipMark } from '@/ui/display';
import { BackHeader, Banner, ErrorState, FadeIn, LoadingState, Screen } from '@/ui/layout';
import { Press, Row, T } from '@/ui/primitives';

export default function AccountsScreen() {
  const { c } = useTheme();
  const { me, refreshMe } = useSession();
  const params = useLocalSearchParams<{ rejected?: string }>();
  const [accounts, setAccounts] = useState<DiscoveredAccountDTO[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<ConsentDTO | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = async () => {
    setError(null);
    try {
      const [d, cs] = await Promise.all([onboardingApi.discovery(), onboardingApi.consents()]);
      setAccounts(d.accounts);
      // Pre-select accounts that aren't connected yet; the user decides what to share.
      setSelected(new Set(d.accounts.filter((a) => !a.linked).map((a) => a.id)));
      setPending(cs.consents.find((x) => x.status === 'PENDING') ?? null);
      void refreshMe();
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const groups = useMemo(() => {
    const list = accounts ?? [];
    return [
      { title: 'Bank accounts', items: list.filter((a) => a.group === 'BANK') },
      { title: 'Investments & savings', items: list.filter((a) => a.group === 'INVESTMENT') },
    ].filter((g) => g.items.length);
  }, [accounts]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const rejected = params.rejected === '1' || me?.onboardingState === 'CONSENT_REJECTED';
  const count = selected.size;

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        accounts && accounts.length ? (
          <View style={{ gap: space.md }}>
            <T v="small" tone="secondary">
              You can add or remove accounts later
            </T>
            <Button
              label={count ? `Continue (${count} selected)` : 'Select an account'}
              disabled={!count}
              onPress={() => router.push({ pathname: '/onboarding/consent', params: { ids: [...selected].join(',') } })}
            />
          </View>
        ) : null
      }
    >
      <BackHeader onBack={() => (router.canGoBack() ? router.back() : router.replace('/onboarding/discover'))} />
      <FadeIn>
        <T v="headline" style={{ marginTop: space.md }} accessibilityRole="header">
          {'We found your\nfinancial accounts'}
        </T>
        <T v="body" tone="secondary" style={{ marginTop: space.sm }}>
          Select the accounts you want to connect.
        </T>
      </FadeIn>
      <View style={{ marginTop: space.xl, gap: space.md }}>
        {rejected ? <Banner tone="warning" title="Consent not approved" body="No data was shared. Choose accounts and try again when you're ready." /> : null}
        {pending ? (
          <Banner
            tone="info"
            title="Waiting for your approval"
            body="Your last connection request is still pending in the Account Aggregator."
            action="Continue"
            onAction={() =>
              pending.approvalUrl?.startsWith('sandbox:')
                ? router.push({ pathname: '/onboarding/approve', params: { pid: pending.approvalUrl.slice(8), cid: pending.id } })
                : router.push({ pathname: '/onboarding/consent', params: { ids: pending.accounts.map((a) => a.id).join(','), consentId: pending.id } })
            }
          />
        ) : null}
      </View>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !accounts ? (
        <LoadingState label="Loading accounts…" />
      ) : accounts.length === 0 ? (
        <View style={{ paddingVertical: space.xxxl, gap: space.md }}>
          <T v="bodySemibold">No accounts found</T>
          <T v="small" tone="secondary">
            We couldn't find accounts linked to this number. Check that your bank has this mobile number on record, then search again.
          </T>
          <Button label="Search again" variant="outline" onPress={() => router.replace('/onboarding/discover')} />
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.title} style={{ marginTop: space.xl }}>
            <T v="smallMedium" tone="secondary" style={{ marginBottom: space.sm }}>
              {g.title}
            </T>
            <View style={{ gap: space.sm }}>
              {g.items.map((a) => {
                const on = selected.has(a.id);
                return (
                  <Press
                    key={a.id}
                    onPress={() => !a.linked && toggle(a.id)}
                    disabled={a.linked}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on || a.linked, disabled: a.linked }}
                    accessibilityLabel={`${a.fip.name}, ${a.typeLabel} ending ${a.maskedNumber.slice(-4)}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      padding: space.lg,
                      borderRadius: radius.lg,
                      borderWidth: 1,
                      borderColor: on ? c.infoSoft : c.border,
                      backgroundColor: on ? c.infoSoft : c.surface,
                    }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        borderWidth: on || a.linked ? 0 : 1.5,
                        borderColor: c.textTertiary,
                        backgroundColor: on ? c.info : a.linked ? c.positive : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {on || a.linked ? <Check size={15} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                    <FipMark fip={a.fip} size={34} />
                    <View style={{ flex: 1 }}>
                      <T v="bodySemibold">{a.fip.name}</T>
                      <T v="small" tone="secondary">{`${a.typeLabel} •••• ${a.maskedNumber.slice(-4)}`}</T>
                    </View>
                    {a.linked ? (
                      <T v="captionMedium" tone="positive">
                        Connected
                      </T>
                    ) : null}
                  </Press>
                );
              })}
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}
