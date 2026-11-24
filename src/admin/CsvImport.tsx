import React, { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { rpc, isApiError } from '../lib/api';
import { errorText } from './lib';
import { Button, Modal, Notice, Table, Td, Th } from './ui';
import { toast } from './toast';

export interface CsvError { row: number; field: string; message: string }
export interface CsvResult { dryRun: boolean; rows: number; errors: CsvError[]; [k: string]: unknown }

/**
 * Upload a spreadsheet saved as CSV. Step 1 checks every row and lists problems without changing
 * anything; step 2 applies it. All rows go in together or none do.
 */
export const CsvImport: React.FC<{
  open: boolean; onClose: () => void; title: string; fn: string; extra?: Record<string, unknown>;
  explain: React.ReactNode; summary: (r: CsvResult, applied: boolean) => React.ReactNode;
}> = ({ open, onClose, title, fn, extra, explain, summary }) => {
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [check, setCheck] = useState<CsvResult | null>(null);
  const [applied, setApplied] = useState<CsvResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setCsv(null); setCheck(null); setApplied(null); setFileName(''); if (input.current) input.current.value = ''; };
  const close = () => { reset(); onClose(); };

  const call = async (text: string, dryRun: boolean): Promise<CsvResult | null> => {
    try {
      return await rpc<CsvResult>(fn, { p_csv: text, p_dry_run: dryRun, ...extra });
    } catch (err) {
      if (isApiError(err) && Array.isArray(err.details?.errors)) return { dryRun: true, rows: 0, errors: err.details.errors as CsvError[] };
      toast.error(errorText(err));
      return null;
    }
  };

  const choose = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error('The file is too big (5 MB most). Split it into smaller files.'); return; }
    const text = (await f.text()).replace(/^﻿/, '');
    setFileName(f.name);
    setCsv(text);
    setApplied(null);
    setBusy(true);
    setCheck(await call(text, true));
    setBusy(false);
  };

  const apply = async () => {
    if (!csv) return;
    setBusy(true);
    const r = await call(csv, false);
    setBusy(false);
    if (!r) return;
    if (r.errors.length) { setCheck(r); return; }
    setApplied(r);
    await qc.invalidateQueries({ queryKey: ['admin'] });
    toast.success('Import finished');
  };

  return (
    <Modal open={open} onClose={close} title={title} size="lg"
      footer={applied ? <Button variant="primary" onClick={close}>Done</Button> : <>
        <Button variant="ghost" onClick={close}>Close</Button>
        {check && !check.errors.length && <Button variant="primary" loading={busy} onClick={() => void apply()}>Import now</Button>}
      </>}>
      <div className="text-sm text-slate-600 space-y-1">{explain}</div>
      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void choose(e.target.files)} />
      {!applied && (
        <Button variant={check ? 'outline' : 'primary'} icon={<FileUp className="w-4 h-4" />} loading={busy && !check} onClick={() => input.current?.click()}>
          {fileName ? `Choose a different file (now: ${fileName})` : 'Choose the CSV file'}
        </Button>
      )}
      {applied ? <Notice tone="success">{summary(applied, true)}</Notice> : check && (check.errors.length ? (
        <>
          <Notice tone="danger">Nothing was changed. Fix these {check.errors.length} problem{check.errors.length === 1 ? '' : 's'} in the spreadsheet, save it as CSV again and choose it again.</Notice>
          <Table className="max-h-80 overflow-y-auto border border-[#E2E8F0] rounded-md">
            <thead><tr><Th>Row</Th><Th>Column</Th><Th>Problem</Th></tr></thead>
            <tbody>{check.errors.slice(0, 300).map((e, i) => <tr key={i}><Td>{e.row}</Td><Td>{e.field}</Td><Td>{e.message}</Td></tr>)}</tbody>
          </Table>
        </>
      ) : <Notice tone="info">Checked, no problems. {summary(check, false)} Press <b>Import now</b> to apply it.</Notice>)}
    </Modal>
  );
};
