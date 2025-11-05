import { useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { Loader2 } from 'lucide-react';
import { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';

interface VirtualizedListProps {
  attempt: TaskAttempt;
  task?: TaskWithAttemptStatus;
}

const VirtualizedList = ({ attempt, task }: VirtualizedListProps) => {
  const [entries, setEntriesState] = useState<PatchTypeWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false);
  const { setEntries, reset } = useEntries();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const didInitScroll = useRef(false);

  const messageListContext = useMemo(
    () => ({ attempt, task }),
    [attempt, task]
  );

  useEffect(() => {
    setLoading(true);
    setEntriesState([]);
    setShouldAutoScroll(false);
    didInitScroll.current = false;
    reset();
  }, [attempt.id, reset]);

  // Initial scroll to bottom once data appears
  useEffect(() => {
    if (!didInitScroll.current && entries.length > 0 && !loading) {
      didInitScroll.current = true;
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: entries.length - 1,
          align: 'end',
          behavior: 'auto',
        });
      });
    }
  }, [entries.length, loading]);

  const onEntriesUpdated = (
    newEntries: PatchTypeWithKey[],
    addType: AddEntryType,
    newLoading: boolean
  ) => {
    setEntriesState(newEntries);
    setEntries(newEntries);

    // Enable auto-scroll when new entries are added while running
    if (addType === 'running' && !loading) {
      setShouldAutoScroll(true);
    } else {
      setShouldAutoScroll(false);
    }

    if (loading) {
      setLoading(newLoading);
    }
  };

  useConversationHistory({ attempt, onEntriesUpdated });

  const renderItem = (index: number) => {
    const data = entries[index];
    if (!data) return null;

    if (data.type === 'STDOUT') {
      return <p>{data.content}</p>;
    }
    if (data.type === 'STDERR') {
      return <p>{data.content}</p>;
    }
    if (data.type === 'NORMALIZED_ENTRY') {
      return (
        <DisplayConversationEntry
          expansionKey={data.patchKey}
          entry={data.content}
          executionProcessId={data.executionProcessId}
          taskAttempt={messageListContext.attempt}
          task={messageListContext.task}
        />
      );
    }

    return null;
  };

  return (
    <ApprovalFormProvider>
      <Virtuoso<PatchTypeWithKey>
        ref={virtuosoRef}
        className="flex-1"
        data={entries}
        computeItemKey={(_index, item) => `l-${item.patchKey}`}
        itemContent={(index) => renderItem(index)}
        components={{
          Header: () => <div className="h-2"></div>,
          Footer: () => <div className="h-2"></div>,
        }}
        atBottomStateChange={setAtBottom}
        followOutput={shouldAutoScroll && atBottom ? 'smooth' : false}
        increaseViewportBy={{ top: 0, bottom: 600 }}
      />
      {loading && (
        <div className="float-left top-0 left-0 w-full h-full bg-primary flex flex-col gap-2 justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Loading History</p>
        </div>
      )}
    </ApprovalFormProvider>
  );
};

export default VirtualizedList;
