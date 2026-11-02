import { Fragment, type ReactNode } from 'react';
import { messageParts, type MessageKey } from '../i18n/core.mjs';
import { useLocale } from './i18n';

/** Plain dictionary text with React slots; no HTML parsing or DOM substitutions. */
export default function LocalizedText({ id, values = [] }: { id: MessageKey; values?: readonly ReactNode[] }) {
  const locale = useLocale();
  return <>{messageParts(locale, id, values).map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>;
}
