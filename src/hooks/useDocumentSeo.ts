import { useEffect } from 'react';
import type { WorkspaceTab } from '../components/TopBar';
import type { Language } from '../data/i18n';

const CANONICAL_ROOT_URL = 'https://files.vz.gay/';

interface SeoEntry {
  title: string;
  description: string;
}

const TAB_SEO: Record<Language, Record<WorkspaceTab, SeoEntry>> = {
  id: {
    transfer: {
      title: 'VZ Files (files.vz.gay) — Transfer File Sementara',
      description:
        'Unggah dan bagikan file sementara lewat files.vz.gay dengan tautan cepat, kode QR, dan Brankas SSO yang didukung oleh VikingFiles.',
    },
    check: {
      title: 'Cek & Info File — VZ Files (files.vz.gay)',
      description:
        'Periksa status berkas, salin tautan berbagi, dan buat kode QR untuk file sementara di files.vz.gay.',
    },
    vault: {
      title: 'Brankas Multi-Hash VZ SSO — VZ Files',
      description:
        'Kelola dan sinkronkan daftar User Hash VikingFiles dalam satu akun VZ SSO di files.vz.gay.',
    },
  },
  en: {
    transfer: {
      title: 'VZ Files (files.vz.gay) — Temporary File Transfer',
      description:
        'Upload and share temporary files on files.vz.gay with instant links, QR codes, and VZ SSO Vault powered by VikingFiles.',
    },
    check: {
      title: 'Check & File Info — VZ Files (files.vz.gay)',
      description:
        'Verify file availability, copy share links, and generate QR codes for temporary transfers on files.vz.gay.',
    },
    vault: {
      title: 'VZ SSO Multi-Hash Vault — VZ Files',
      description:
        'Save and sync multiple VikingFiles User Hashes under one VZ SSO account on files.vz.gay.',
    },
  },
};

function upsertMeta(attribute: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attribute, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function ensureCanonicalLink(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function useDocumentSeo(
  lang: Language,
  activeTab: WorkspaceTab,
  inspectedHash: string | null
) {
  useEffect(() => {
    document.documentElement.lang = lang;

    const baseEntry = TAB_SEO[lang][activeTab];
    const title = inspectedHash
      ? lang === 'id'
        ? `Info File ${inspectedHash} — VZ Files`
        : `File Info ${inspectedHash} — VZ Files`
      : baseEntry.title;

    const description = inspectedHash
      ? lang === 'id'
        ? `Pratinjau informasi dan tautan unduhan resmi untuk berkas ${inspectedHash} di VZ Files.`
        : `Inspect file details and official download routing for ${inspectedHash} on VZ Files.`
      : baseEntry.description;

    document.title = title;
    ensureCanonicalLink(CANONICAL_ROOT_URL);

    upsertMeta('name', 'description', description);
    upsertMeta(
      'name',
      'robots',
      inspectedHash ? 'noindex, follow' : 'index, follow, max-image-preview:large'
    );
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:locale', lang === 'id' ? 'id_ID' : 'en_US');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
  }, [lang, activeTab, inspectedHash]);
}
