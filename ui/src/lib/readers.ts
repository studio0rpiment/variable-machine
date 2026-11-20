/**
 * The fields a multi-agent studio's reader returns, by its set's name, where
 * the Projects card names them: the Data tab's drafts and the card's command
 * both fill them in. A reader not listed takes its fields from its own rows.
 */
const READER_FIELDS: Record<string, string> = {
  'studio-mail': 'sender,work,ask,deadline',
}

export const readerFields = (dataset: string): string | undefined => READER_FIELDS[dataset]
