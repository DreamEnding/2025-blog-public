import type { Entry } from './site-db'

export type DraftFields = Pick<Entry, 'id' | 'section_id' | 'title' | 'summary' | 'body' | 'position'>

export function draftFields(entry: DraftFields): DraftFields {
	const { id, section_id, title, summary, body, position } = entry
	return { id, section_id, title, summary, body, position }
}

export function sameDraft(first?: DraftFields | null, second?: DraftFields | null) {
	return Boolean(
		first &&
			second &&
			first.id === second.id &&
			first.section_id === second.section_id &&
			first.title === second.title &&
			first.summary === second.summary &&
			first.body === second.body &&
			first.position === second.position
	)
}

export function reconcileEntry(current: Entry, server: Entry): Entry {
	return current.id === server.id ? { ...server, ...draftFields(current) } : { ...server }
}

export function reconcileSavedEntry(current: Entry, sent: DraftFields, server: Entry): Entry {
	if (current.id !== sent.id) return current
	return {
		...server,
		section_id: current.section_id === sent.section_id ? server.section_id : current.section_id,
		title: current.title === sent.title ? server.title : current.title,
		summary: current.summary === sent.summary ? server.summary : current.summary,
		body: current.body === sent.body ? server.body : current.body,
		position: current.position === sent.position ? server.position : current.position
	}
}

export function recoverDraft(server: Entry, value: unknown): Entry | null {
	const record = value as { base?: DraftFields; draft?: DraftFields } | null
	const draft = record?.draft
	if (
		!record?.base ||
		!draft ||
		!sameDraft(server, record.base) ||
		draft.id !== server.id ||
		typeof draft.title !== 'string' ||
		typeof draft.summary !== 'string' ||
		typeof draft.body !== 'string' ||
		!Number.isSafeInteger(draft.section_id) ||
		!Number.isSafeInteger(draft.position) ||
		draft.position < 0 ||
		sameDraft(server, draft)
	)
		return null
	return { ...server, ...draftFields(draft) }
}
