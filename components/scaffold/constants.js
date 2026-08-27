export const TYPE_META = {
  claim: { label: 'Claim', color: 'emerald' },
  premise: { label: 'Premise', color: 'emerald' },
  objection: { label: 'Objection', color: 'amber' },
  note: { label: 'Note', color: 'slate' },
  task: { label: 'Task', color: 'blue' },
};

export const STATUS_META = {
  todo: { label: 'To do', cls: 'bg-slate-500' },
  in_progress: { label: 'In progress', cls: 'bg-blue-500' },
  done: { label: 'Done', cls: 'bg-emerald-500' },
  waiting: { label: 'Waiting', cls: 'bg-amber-500' },
};

export const RELATIONS = [
  { value: 'supports', label: 'Supports (solid green)' },
  { value: 'objects_to', label: 'Objects to (dashed grey)' },
  { value: 'backlink', label: 'Backlink (plain link)' },
  { value: 'follow_up', label: 'Follow-up (task → next task)' },
];
