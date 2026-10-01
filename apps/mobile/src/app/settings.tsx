import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ChevronRight, FlaskConical, Landmark, LogOut, Smartphone, Trash } from 'lucide-react-native';
import { formatDate, type ThemePreference } from '@finance-buddy/core';
import { api, errorMessage } from '@/lib/api';
import { useHealth, useSessions } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Button, IconButton, Segmented, TextField } from '@/ui/controls';
import { BackHeader, Banner, Screen, Sheet } from '@/ui/layout';
import { Card, Divider, Press, Row, SectionTitle, T } from '@/ui/primitives';

/** Settings: profile, appearance, accounts & consent, devices, privacy and deletion (Blueprint §23). */
export default function SettingsScreen() {
  const { c, preference, setPreference } = useTheme();
  const { me, signOut, refreshMe } = useSession();
  const sessions = useSessions();
  const health = useHealth();
  const [name, setName] = useState(me?.name ?? '');
  const [editingName, setEditingName] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setTheme = (p: ThemePreference) => {
    setPreference(p);
    void api('/v1/me', { method: 'PATCH', body: { themePreference: p } }).catch(() => undefined);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader title="Settings" />
      {health.data?.aa === 'mock' ? (
        <Row gap={space.sm} style={{ backgroundColor: c.warningSoft, padding: space.md, borderRadius: 12, marginBottom: space.lg }}>
          <FlaskConical size={16} color={c.warning} />
          <T v="small" tone="secondary" style={{ flex: 1 }}>
            Sandbox mode: accounts and transactions come from a test Account Aggregator persona, not a real bank.
          </T>
        </Row>
      ) : null}

      <SectionTitle>Profile</SectionTitle>
      <Card>
        <Press onPress={() => setEditingName(true)} accessibilityRole="button" accessibilityLabel="Edit name" scaleTo={0.99}>
          <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <View>
              <T v="small" tone="secondary">
                Name
              </T>
              <T v="bodyMedium">{me?.name ?? 'Add your name'}</T>
            </View>
            <ChevronRight size={18} color={c.textTertiary} />
          </Row>
        </Press>
        <Divider />
        <View style={{ paddingVertical: 8 }}>
          <T v="small" tone="secondary">
            Mobile
          </T>
          <T v="bodyMedium">{me?.phoneMasked ?? ''}</T>
        </View>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <SectionTitle>Appearance</SectionTitle>
        <Segmented
          options={[
            { key: 'system', label: 'System' },
            { key: 'light', label: 'Light' },
            { key: 'dark', label: 'Dark' },
          ]}
          value={preference}
          onChange={setTheme}
        />
      </View>

      <View style={{ marginTop: space.xl }}>
        <SectionTitle>Accounts & consent</SectionTitle>
        <Card>
          <Press onPress={() => router.push('/accounts')} accessibilityRole="button" scaleTo={0.99}>
            <Row gap={space.md} style={{ paddingVertical: 4 }}>
              <Landmark size={20} color={c.textSecondary} />
              <T v="body" style={{ flex: 1 }}>
                Connected accounts and consents
              </T>
              <ChevronRight size={18} color={c.textTertiary} />
            </Row>
          </Press>
        </Card>
      </View>

      <View style={{ marginTop: space.xl }}>
        <SectionTitle>Signed-in devices</SectionTitle>
        <Card>
          {(sessions.data?.sessions ?? []).map((s, i) => (
            <View key={s.id}>
              {i > 0 ? <Divider /> : null}
              <Row gap={space.md} style={{ paddingVertical: 8 }}>
                <Smartphone size={20} color={c.textSecondary} />
                <View style={{ flex: 1 }}>
                  <T v="bodyMedium">{`${s.deviceName}${s.current ? ' (this device)' : ''}`}</T>
                  <T v="caption" tone="tertiary">{`Last active ${formatDate(s.lastSeenAt)}`}</T>
                </View>
                {!s.current ? (
                  <IconButton
                    icon={LogOut}
                    label={`Sign out ${s.deviceName}`}
                    size={18}
                    onPress={async () => {
                      await api(`/v1/me/sessions/${s.id}`, { method: 'DELETE' }).catch(() => undefined);
                      void sessions.refetch();
                    }}
                  />
                ) : null}
              </Row>
            </View>
          ))}
          {sessions.isLoading ? <T v="small" tone="secondary">Loading…</T> : null}
        </Card>
      </View>

      <View style={{ marginTop: space.xl }}>
        <SectionTitle>Privacy</SectionTitle>
        <Card>
          <T v="small" tone="secondary">
            Your data comes only from accounts you approve through an RBI-regulated Account Aggregator. We never ask for bank passwords, we store sensitive fields encrypted, and we don't use your financial data to train AI models. SI works from calculated summaries, not raw bank statements.
          </T>
        </Card>
      </View>

      <View style={{ marginTop: space.xl, gap: space.md }}>
        <Button label="Sign out" icon={LogOut} variant="outline" onPress={async () => {
          await signOut();
          router.replace('/onboarding/phone');
        }} />
        <Button label="Delete my account and data" icon={Trash} variant="danger" onPress={() => setDeleting(true)} />
        <T v="caption" tone="tertiary" align="center">{`Finance Buddy ${Constants.expoConfig?.version ?? ''}`}</T>
      </View>

      <Sheet
        visible={editingName}
        onClose={() => setEditingName(false)}
        title="Your name"
        footer={
          <Button
            label="Save"
            disabled={!name.trim()}
            onPress={async () => {
              try {
                await api('/v1/me', { method: 'PATCH', body: { name: name.trim() } });
                await refreshMe();
                setEditingName(false);
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          />
        }
      >
        <TextField value={name} onChangeText={setName} placeholder="Your name" maxLength={60} autoFocus />
        {error ? <Banner tone="negative" title={error} /> : null}
      </Sheet>

      <Sheet
        visible={deleting}
        onClose={() => setDeleting(false)}
        title="Delete account?"
        footer={
          <View style={{ gap: space.sm }}>
            <Button
              label="Delete everything"
              variant="danger"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await api('/v1/me', { method: 'DELETE' });
                  await signOut();
                  router.replace('/onboarding/phone');
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Button label="Cancel" variant="ghost" onPress={() => setDeleting(false)} />
          </View>
        }
      >
        <T v="body" tone="secondary">
          We'll revoke every Account Aggregator consent and permanently delete your accounts, transactions, goals and SI history. This can't be undone.
        </T>
        {error ? <Banner tone="negative" title={error} /> : null}
      </Sheet>
    </Screen>
  );
}
