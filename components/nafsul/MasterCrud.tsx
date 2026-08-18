"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/nafsul/api";
import type { Paginated } from "@/lib/nafsul/types";
import { Button } from "@/components/atoms/Button";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { DataTable, type Column } from "@/components/molecules/DataTable";
import { FieldGroup } from "@/components/molecules/FieldGroup";
import { Input } from "@/components/atoms/Input";
import { Modal } from "@/components/molecules/Modal";
import { PageHeader } from "@/components/molecules/PageHeader";
import { Pagination } from "@/components/molecules/Pagination";
import { ResultDialog } from "@/components/molecules/ResultDialog";
import { Select } from "@/components/atoms/Select";
import { apiErrorMessage } from "@/lib/apiError";
import { useT } from "@/lib/i18n";


export interface MasterField {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  /** hanya bisa diisi saat membuat (mis. primary key) */
  pk?: boolean;
}

interface MasterCrudProps {
  endpoint: string;
  title: string;
  subtitle?: string;
  pkField: string;
  fields: MasterField[];
  columns: { name: string; label: string; render?: (row: Record<string, unknown>) => string }[];
  /** Tampilkan kolom "No" (nomor urut, lanjut antar halaman) di kiri tabel. */
  nomor?: boolean;
  /** filter tambahan untuk daftar, mis. { kategori: "kas_keluar" } */
  filter?: Record<string, string | number>;
  /** nilai otomatis yang dikirim saat membuat data baru, mis. { kategori: "kas_keluar" } */
  defaults?: Record<string, string>;
  /**
   * Modal impor Excel untuk master ini. Bila diisi, tombol "Import Excel" muncul
   * di header dan daftar dimuat ulang setelah impor selesai. Sengaja berupa
   * render prop supaya MasterCrud tidak perlu tahu kolom & endpoint impornya.
   */
  renderImport?: (p: {
    open: boolean;
    onClose: () => void;
    onSelesai: () => void;
  }) => React.ReactNode;
}

type Row = Record<string, unknown>;

/** Dipakai untuk permintaan daftar, penomoran baris, dan info paginasi. */
const PER_PAGE = 15;

/**
 * Tombol Simpan berada di slot `footer` milik Modal — di luar <form>. Atribut
 * `form` pada tombol yang menunjuk id ini yang menyambungkannya kembali.
 */
const FORM_ID = "master-crud-form";

export default function MasterCrud({
  endpoint,
  title,
  subtitle,
  pkField,
  fields,
  columns,
  nomor,
  filter,
  defaults,
  renderImport,
}: MasterCrudProps) {
  const [data, setData] = useState<Paginated<Row> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; row?: Row } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<{
    variant: "success" | "error";
    description: string;
  } | null>(null);
  const t = useT();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const filterKey = JSON.stringify(filter ?? {});
  const load = useCallback(() => {
    setLoading(true);
    api<Paginated<Row>>(`/${endpoint}`, {
      params: { ...filter, search: debounced, page, per_page: PER_PAGE },
    })
      .then(setData)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, debounced, page, filterKey]);

  useEffect(() => {
    load();
  }, [load]);

  // Kolom MasterCrud (`{ name, label, render }`) dipetakan ke bentuk kolom
  // DataTable. Nilai kosong dirender sebagai em dash redup, bukan string "-",
  // supaya sel kosong seragam dengan tabel lain di aplikasi.
  const kolomTabel: Column<Row>[] = columns.map((c) => ({
    header: c.label,
    cell: (row) => {
      if (c.render) return c.render(row);
      const nilai = row[c.name];

      return nilai == null || nilai === "" ? (
        <span className="text-gray-400 text-xs">—</span>
      ) : (
        String(nilai)
      );
    },
  }));

  /** Label baris untuk kalimat konfirmasi hapus — kolom kedua biasanya nama. */
  function labelBaris(row: Row) {
    return String(row[columns[1]?.name] ?? row[pkField]);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/${endpoint}/${deleteTarget[pkField]}`, { method: "DELETE" });
      setDeleteTarget(null);
      setResult({ variant: "success", description: t("nafsulMaster.deletedOk") });
      load();
    } catch (err) {
      setDeleteTarget(null);
      setResult({
        variant: "error",
        description: apiErrorMessage(err, t("nafsulMaster.deleteFailed")),
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        className="mb-5"
        title={title}
        subtitle={subtitle}
        action={
          <div className="flex flex-wrap gap-2">
            {renderImport && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                {t("nafsulMaster.importExcel")}
              </Button>
            )}
            <Button
              onClick={() => setModal({ mode: "create" })}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {t("nafsulMaster.add")}
            </Button>
          </div>
        }
      />

      {renderImport?.({
        open: importOpen,
        onClose: () => setImportOpen(false),
        onSelesai: load,
      })}

      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <Input placeholder={t("nafsulMaster.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">{t("nafsulMaster.loading")}</div>
        ) : (
          <DataTable
            columns={kolomTabel}
            data={data?.data ?? []}
            hideRowNumber={!nomor}
            rowNumberOffset={((data?.current_page ?? 1) - 1) * PER_PAGE}
            onEdit={(row) => setModal({ mode: "edit", row })}
            onDelete={(row) => setDeleteTarget(row)}
            isRowLoading={(row) => deleting && row === deleteTarget}
            emptyMessage={t("nafsulMaster.empty")}
          />
        )}

        {data && (
          <Pagination
            currentPage={data.current_page}
            totalPages={data.last_page}
            totalItems={data.total}
            itemsPerPage={PER_PAGE}
            onPageChange={setPage}
          />
        )}
      </div>

      {modal && (
        <MasterModal
          endpoint={endpoint}
          pkField={pkField}
          fields={fields}
          defaults={defaults}
          mode={modal.mode}
          row={modal.row}
          onClose={() => setModal(null)}
          onSaved={(pesan) => {
            setModal(null);
            setResult({ variant: "success", description: pesan });
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        description={
          deleteTarget
            ? t("nafsulMaster.confirmDelete", { label: labelBaris(deleteTarget) })
            : undefined
        }
      />

      <ResultDialog
        open={result !== null}
        onClose={() => setResult(null)}
        variant={result?.variant ?? "success"}
        description={result?.description}
      />
    </div>
  );
}

function MasterModal({
  endpoint,
  pkField,
  fields,
  defaults,
  mode,
  row,
  onClose,
  onSaved,
}: {
  endpoint: string;
  pkField: string;
  fields: MasterField[];
  defaults?: Record<string, string>;
  mode: "create" | "edit";
  row?: Row;
  onClose: () => void;
  /** Dipanggil setelah simpan berhasil — pesannya dipakai MasterCrud untuk ResultDialog. */
  onSaved: (pesan: string) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    fields.forEach((f) => {
      const v = row ? row[f.name] : "";
      init[f.name] = v == null ? "" : String(f.type === "date" ? String(v).slice(0, 10) : v);
    });
    return init;
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  /** Galat non-validasi (mis. server error) — validasi per field tampil di bawah inputnya. */
  const [flash, setFlash] = useState<string | null>(null);
  const t = useT();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFlash(null);

    const payload: Record<string, string | null> = {};
    fields.forEach((f) => {
      if (mode === "edit" && f.pk) return;
      payload[f.name] = form[f.name] === "" ? null : form[f.name];
    });

    try {
      if (mode === "create") {
        await api(`/${endpoint}`, { method: "POST", body: { ...defaults, ...payload } });
      } else {
        await api(`/${endpoint}/${row![pkField]}`, { method: "PUT", body: payload });
      }
      onSaved(t(mode === "create" ? "nafsulMaster.createdOk" : "nafsulMaster.updatedOk"));
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setErrors(err.errors);
        setFlash(t("nafsulMaster.checkFields"));
      } else {
        setFlash(apiErrorMessage(err, t("nafsulMaster.saveFailed")));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t(mode === "create" ? "nafsulMaster.modalAdd" : "nafsulMaster.modalEdit")}
      size="md"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={submitting}
            className="bg-[#075489] hover:bg-[#075489]/90 text-white"
          >
            {submitting ? t("common.saving") : t("common.save")}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        {flash && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{flash}</p>
        )}
        {fields.map((f) => {
          const disabled = mode === "edit" && f.pk;
          return (
            <FieldGroup key={f.name} label={f.label}>
              {f.type === "select" ? (
                <Select
                  value={form[f.name]}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                >
                  <option value="">-</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              ) : (
                <Input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  value={form[f.name]}
                  required={f.required}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                />
              )}
              {errors[f.name] && (
                <span className="text-xs text-rose-600">{errors[f.name][0]}</span>
              )}
            </FieldGroup>
          );
        })}
      </form>
    </Modal>
  );
}
