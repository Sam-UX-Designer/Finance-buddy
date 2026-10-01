import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Pencil, Repeat, Split } from 'lucide-react-native';
import {
  category,
  CATEGORIES,
  formatDate,
  formatINR,
  formatTime,
  parseRupeeInput,
  TXN_TYPE_LABELS,
  typesForDirection,
  type CategoryId,
  type TxnDTO,
  type TxnType,
} from '@finance-buddy/core';
import { errorMessage } from '@/lib/api';
import { usePatchTxn, useSplitTxn, useTxn } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Button, Chip, TextField, Toggle } from '@/ui/controls';
import { EmojiAvatar, KeyValue, TxnAmount } from '@/ui/display';
import { BackHeader, Banner, ErrorState, FadeIn, LoadingState, Screen, Sheet } from '@/ui/layout';
import { Card, Divider, Press, Row, T } from '@/ui/primitives';

const SOURCE_LABEL = { USER: 'Set by you', RULE: 'Auto-categorised', ENGINE: 'Detected by Finance Buddy' } as const;

/** Transaction detail (Blueprint §9): source account, merchant, category, type, recurring, confidence. */
export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const txn = useTxn(id);
  const patch = usePatchTxn(id);
  const [sheet, setSheet] = useState<'category' | 'type' | 'note' | 'split' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = txn.data;

  const save = async (body: Parameters<typeof patch.mutateAsync>[0]) => {
    setError(null);
    try {
      await patch.mutateAsync(body);
      setSheet(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader />
      {txn.error && !t ? (
        <ErrorState error={txn.error} onRetry={() => txn.refetch()} />
      ) : !t ? (
        <LoadingState />
      ) : (
        <FadeIn>
          <View style={{ alignItems: 'center', gap: 6, marginTop: space.sm }}>
            <EmojiAvatar emoji={t.emoji} categoryId={t.categoryId} merchantKey={t.merchantKey} size={68} />
            <T v="subtitle" align="center" style={{ marginTop: space.sm }} accessibilityRole="header">
              {t.merchantName}
            </T>
            <T v="small" tone="secondary">{`${t.categoryName} · ${t.mode === 'INTEREST' ? 'Bank' : t.mode}`}</T>
            <View style={{ marginTop: space.md }}>
              <TxnAmount amount={t.amount} type={t.type} direction={t.direction} v="amount" />
            </View>
            <T v="small" tone="secondary">{`${formatDate(t.postedAt)}, ${formatTime(t.postedAt)}`}</T>
          </View>

          {error ? (
            <View style={{ marginTop: space.lg }}>
              <Banner tone="negative" title={error} />
            </View>
          ) : null}

          <T v="section" style={{ marginTop: space.xxl, marginBottom: space.xs }}>
            Details
          </T>
          <KeyValue label="Category" value={`${category(t.categoryId).emoji} ${t.categoryName}`} onPress={() => setSheet('category')} />
          <Divider />
          <KeyValue label="Type" value={t.typeLabel} onPress={() => setSheet('type')} />
          <Divider />
          <KeyValue label="Merchant" value={t.merchantName} />
          <Divider />
          <KeyValue label="Payment mode" value={t.mode === 'INTEREST' ? 'Bank credit' : t.mode} />
          {t.reference ? (
            <>
              <Divider />
              <KeyValue label="Transaction ID" value={t.reference} />
            </>
          ) : null}
          <Divider />
          <KeyValue
            label="Account"
            value={
              <Row gap={6}>
                <T v="bodyMedium" tone="info">
                  {t.accountName}
                </T>
                <T v="bodyMedium">{`•••• ${t.accountMask}`}</T>
              </Row>
            }
          />
          <Divider />
          <KeyValue label="Recurring" value={t.isRecurring ? 'Yes' : 'No'} />
          <Divider />
          <KeyValue label="How it was sorted" value={t.typeSource === 'USER' || t.categorySource === 'USER' ? SOURCE_LABEL.USER : `${SOURCE_LABEL[t.typeSource]} · ${Math.round(t.confidence * 100)}% sure`} />
          <View style={{ marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: c.surfaceMuted }}>
            <T v="caption" tone="tertiary">
              Bank description
            </T>
            <T v="small" tone="secondary" selectable style={{ marginTop: 2 }}>
              {t.narration}
            </T>
          </View>

          {t.splits ? (
            <Card style={{ marginTop: space.lg }}>
              <T v="smallMedium" tone="secondary" style={{ marginBottom: space.sm }}>
                Split
              </T>
              {t.splits.map((p, i) => (
                <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                  <T v="body">{p.type === 'LOAN_GIVEN' ? `${p.counterparty ?? 'Others'} owes you` : `Your share · ${category(p.categoryId).name}`}</T>
                  <T v="bodyMedium">{formatINR(p.amount)}</T>
                </Row>
              ))}
            </Card>
          ) : null}

          <Card style={{ marginTop: space.lg, paddingVertical: space.xs }}>
            <ActionRow icon={<Pencil size={18} color={c.textSecondary} />} label={t.note ? `Note: ${t.note}` : 'Add a note'} onPress={() => setSheet('note')} />
            <Divider />
            {t.direction === 'DEBIT' ? (
              <>
                <ActionRow icon={<Split size={18} color={c.textSecondary} />} label={t.splits ? 'Edit split' : 'Split transaction'} onPress={() => setSheet('split')} />
                <Divider />
              </>
            ) : null}
            <Row gap={space.md} style={{ paddingVertical: space.md }}>
              <Repeat size={18} color={c.textSecondary} />
              <T v="body" style={{ flex: 1 }}>
                Mark as recurring
              </T>
              <Toggle value={t.isRecurring} label="Mark as recurring" onChange={(v) => save({ isRecurring: v })} />
            </Row>
          </Card>
          <CategorySheet visible={sheet === 'category'} t={t} onClose={() => setSheet(null)} onSave={(categoryId, applyToMerchant) => save({ categoryId, applyToMerchant })} busy={patch.isPending} />
          <TypeSheet visible={sheet === 'type'} t={t} onClose={() => setSheet(null)} onSave={(type, applyToMerchant) => save({ type, applyToMerchant })} busy={patch.isPending} />
          <NoteSheet visible={sheet === 'note'} t={t} onClose={() => setSheet(null)} onSave={(note) => save({ note })} busy={patch.isPending} />
          <SplitSheet visible={sheet === 'split'} t={t} onClose={() => setSheet(null)} />
        </FadeIn>
      )}
    </Screen>
  );
}

function ActionRow({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} scaleTo={0.99}>
      <Row gap={space.md} style={{ paddingVertical: space.md }}>
        {icon}
        <T v="body" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </T>
      </Row>
    </Press>
  );
}

function CategorySheet({ visible, t, onClose, onSave, busy }: { visible: boolean; t: TxnDTO; onClose: () => void; onSave: (c: CategoryId, all: boolean) => void; busy: boolean }) {
  const [sel, setSel] = useState<CategoryId>(t.categoryId);
  const [all, setAll] = useState(true);
  useEffect(() => {
    if (visible) setSel(t.categoryId);
  }, [visible, t.categoryId]);
  const kinds = t.direction === 'DEBIT' ? ['spend', 'neutral'] : ['income', 'neutral', 'spend'];
  const options = Object.values(CATEGORIES).filter((c) => kinds.includes(c.kind));
  return (
    <Sheet visible={visible} onClose={onClose} title="Category" footer={<Button label="Save" onPress={() => onSave(sel, all)} loading={busy} />}>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {options.map((c) => (
          <Chip key={c.id} label={`${c.emoji} ${c.name}`} selected={sel === c.id} onPress={() => setSel(c.id)} />
        ))}
      </Row>
      <Row gap={space.md} style={{ marginTop: space.xl }}>
        <T v="body" style={{ flex: 1 }}>{`Use for all ${t.merchantName} transactions`}</T>
        <Toggle value={all} onChange={setAll} label="Apply to all transactions from this merchant" />
      </Row>
    </Sheet>
  );
}

function TypeSheet({ visible, t, onClose, onSave, busy }: { visible: boolean; t: TxnDTO; onClose: () => void; onSave: (type: TxnType, all: boolean) => void; busy: boolean }) {
  const [sel, setSel] = useState<TxnType>(t.type);
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (visible) setSel(t.type);
  }, [visible, t.type]);
  const help: Partial<Record<TxnType, string>> = {
    EXPENSE: 'Money you spent.',
    INVESTMENT: 'Not counted as spending.',
    LOAN_GIVEN: 'Money lent. Tracked until it comes back.',
    LOAN_REPAID: 'Money paid back to you. Not income.',
    TRANSFER: 'Between your own accounts. Not income or spending.',
    INCOME: 'Money you earned or received.',
    REFUND: 'Reduces your spending.',
    ADJUSTMENT: 'A correction by the bank.',
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="What was this?" footer={<Button label="Save" onPress={() => onSave(sel, all)} loading={busy} />}>
      <View style={{ gap: space.sm }}>
        {typesForDirection(t.direction).map((ty) => (
          <Chip key={ty} label={TXN_TYPE_LABELS[ty]} selected={sel === ty} onPress={() => setSel(ty)} />
        ))}
      </View>
      <T v="small" tone="secondary" style={{ marginTop: space.md }}>
        {help[sel]}
      </T>
      <Row gap={space.md} style={{ marginTop: space.xl }}>
        <T v="body" style={{ flex: 1 }}>{`Remember for ${t.merchantName}`}</T>
        <Toggle value={all} onChange={setAll} label="Remember this for this merchant" />
      </Row>
    </Sheet>
  );
}

function NoteSheet({ visible, t, onClose, onSave, busy }: { visible: boolean; t: TxnDTO; onClose: () => void; onSave: (note: string | null) => void; busy: boolean }) {
  const [note, setNote] = useState(t.note ?? '');
  useEffect(() => {
    if (visible) setNote(t.note ?? '');
  }, [visible, t.note]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Note" footer={<Button label="Save note" onPress={() => onSave(note.trim() || null)} loading={busy} />}>
      <TextField value={note} onChangeText={setNote} placeholder="What was this for?" maxLength={280} multiline autoFocus />
    </Sheet>
  );
}

/** Split: your share stays an expense; the rest is tracked as money owed back to you. */
function SplitSheet({ visible, t, onClose }: { visible: boolean; t: TxnDTO; onClose: () => void }) {
  const split = useSplitTxn(t.id);
  const existingShare = t.splits?.find((p) => p.type !== 'LOAN_GIVEN')?.amount;
  const existingWho = t.splits?.find((p) => p.type === 'LOAN_GIVEN')?.counterparty ?? '';
  const [share, setShare] = useState('');
  const [who, setWho] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setShare(existingShare != null ? String(existingShare / 100) : String(Math.round(t.amount / 2) / 100));
      setWho(existingWho);
      setError(null);
    }
  }, [visible]);
  const shareP = parseRupeeInput(share);
  const rest = shareP == null ? null : t.amount - shareP;
  const valid = shareP != null && shareP > 0 && rest != null && rest > 0;
  const shareType: TxnType = t.type === 'LOAN_GIVEN' ? 'EXPENSE' : t.type === 'INVESTMENT' ? 'INVESTMENT' : 'EXPENSE';
  const shareCategory: CategoryId = t.type === 'EXPENSE' ? t.categoryId : 'other';
  const save = async (parts: Parameters<typeof split.mutateAsync>[0]) => {
    setError(null);
    try {
      await split.mutateAsync(parts);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Split transaction"
      footer={
        <View style={{ gap: space.sm }}>
          <Button
            label="Save split"
            disabled={!valid}
            loading={split.isPending}
            onPress={() =>
              save([
                { amount: shareP!, type: shareType, categoryId: shareCategory },
                { amount: rest!, type: 'LOAN_GIVEN', categoryId: 'loans', counterparty: who.trim() || null },
              ])
            }
          />
          {t.splits ? <Button label="Remove split" variant="ghost" onPress={() => save([])} /> : null}
        </View>
      }
    >
      <View style={{ gap: space.lg }}>
        <T v="small" tone="secondary">{`Total ${formatINR(t.amount)}. Your share stays as spending; the rest is tracked as money owed to you.`}</T>
        <TextField label="Your share" value={share} onChangeText={setShare} keyboardType="decimal-pad" prefix={<T v="bodyMedium" tone="secondary">₹</T>} error={share && !valid ? 'Your share must be more than ₹0 and less than the total.' : null} />
        <TextField label="Who owes you? (optional)" value={who} onChangeText={setWho} placeholder="e.g. Arjun" maxLength={60} />
        {valid ? <T v="bodyMedium">{`${who.trim() || 'Others'} owe${who.trim() ? 's' : ''} you ${formatINR(rest!)}`}</T> : null}
        {error ? <Banner tone="negative" title={error} /> : null}
      </View>
    </Sheet>
  );
}
