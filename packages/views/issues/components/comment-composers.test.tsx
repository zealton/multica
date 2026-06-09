import { forwardRef, useImperativeHandle, useRef, type ReactNode, type Ref } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { UploadResult } from "@multica/core/hooks/use-file-upload";
import { renderWithI18n } from "../../test/i18n";
import { CommentInput } from "./comment-input";
import { ReplyInput } from "./reply-input";

const uploadWithToast = vi.hoisted(() => vi.fn());

vi.mock("@multica/core/api", () => ({
  api: {},
}));

vi.mock("@multica/core/hooks/use-file-upload", () => ({
  useFileUpload: () => ({ uploadWithToast }),
}));

vi.mock("../../common/actor-avatar", () => ({
  ActorAvatar: ({ actorType, actorId }: { actorType: string; actorId: string }) => (
    <span data-testid="actor-avatar">
      {actorType}:{actorId}
    </span>
  ),
}));

vi.mock("../../editor", () => ({
  useFileDropZone: () => ({
    isDragOver: false,
    dropZoneProps: { "data-testid": "drop-zone" },
  }),
  FileDropOverlay: () => null,
  ContentEditor: forwardRef(function MockContentEditor(
    {
      defaultValue,
      onUpdate,
      placeholder,
      onUploadFile,
    }: {
      defaultValue?: string;
      onUpdate?: (markdown: string) => void;
      placeholder?: string;
      onUploadFile?: (file: File) => Promise<UploadResult | null>;
    },
    ref: Ref<unknown>,
  ) {
    const valueRef = useRef(defaultValue ?? "");
    const activeUploadsRef = useRef(false);

    useImperativeHandle(ref, () => ({
      getMarkdown: () => valueRef.current,
      clearContent: () => {
        valueRef.current = "";
      },
      focus: () => {},
      blur: () => {},
      uploadFile: async (file: File) => {
        activeUploadsRef.current = true;
        onUpdate?.(valueRef.current);
        const result = await onUploadFile?.(file);
        activeUploadsRef.current = false;
        if (!result) {
          onUpdate?.(valueRef.current);
          return;
        }
        valueRef.current = `${valueRef.current}\n${result.url}`.trim();
        onUpdate?.(valueRef.current);
      },
      hasActiveUploads: () => activeUploadsRef.current,
    }));

    return (
      <textarea
        data-testid="editor"
        defaultValue={defaultValue}
        placeholder={placeholder}
        onChange={(event) => {
          valueRef.current = event.target.value;
          onUpdate?.(event.target.value);
        }}
      />
    );
  }),
}));

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return renderWithI18n(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function renderCommentInput(onSubmit = vi.fn().mockResolvedValue(true)) {
  const view = renderWithProviders(<CommentInput issueId="issue-1" onSubmit={onSubmit} />);
  return { ...view, onSubmit };
}

function renderReplyInput({
  onSubmit = vi.fn().mockResolvedValue(true),
  size = "sm",
}: {
  onSubmit?: (content: string, attachmentIds?: string[], suppressAgentIds?: string[]) => Promise<boolean>;
  size?: "sm" | "default";
} = {}) {
  const view = renderWithProviders(
    <ReplyInput
      issueId="issue-1"
      parentId="comment-1"
      avatarType="member"
      avatarId="user-1"
      onSubmit={onSubmit}
      size={size}
    />,
  );
  return { ...view, onSubmit };
}

function getSubmitButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelectorAll("button")[1];
  if (!button) throw new Error("Expected submit button to render");
  return button;
}

function getFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected file input to render");
  }
  return input;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeUploadResult(overrides: Partial<UploadResult> = {}): UploadResult {
  const url = overrides.url ?? "/uploads/workspaces/ws/att-1.png";
  return {
    id: "att-1",
    workspace_id: "ws-1",
    issue_id: "issue-1",
    comment_id: null,
    chat_session_id: null,
    chat_message_id: null,
    uploader_type: "member",
    uploader_id: "user-1",
    filename: "image.png",
    url,
    download_url: "/api/attachments/att-1/download",
    markdown_url: url,
    content_type: "image/png",
    size_bytes: 12,
    created_at: "2026-06-09T00:00:00Z",
    link: url,
    markdownLink: url,
    ...overrides,
  };
}

beforeEach(() => {
  uploadWithToast.mockReset();
  localStorage.clear();
});

describe("comment composers", () => {
  it("renders the main comment composer without a manual expand control", () => {
    const { container } = renderCommentInput();

    expect(screen.getByPlaceholderText("Leave a comment...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attach file" })).toBeInTheDocument();
    expect(container.querySelectorAll("button")).toHaveLength(2);

    const shell = screen.getByTestId("drop-zone");
    expect(shell.className).not.toMatch(/max-h-/);
    expect(shell.className).not.toContain("h-[70vh]");
  });

  it("renders reply composer without a manual expand control", () => {
    const { container } = renderReplyInput();

    expect(screen.getByPlaceholderText("Leave a reply...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attach file" })).toBeInTheDocument();
    expect(container.querySelectorAll("button")).toHaveLength(2);

    const shell = screen.getByTestId("drop-zone");
    expect(shell.className).not.toMatch(/max-h-/);
    expect(shell.className).not.toContain("h-[60vh]");
  });

  it("lets default-size replies grow without a height cap", () => {
    const { container } = renderReplyInput({ size: "default" });

    expect(screen.getByPlaceholderText("Leave a reply...")).toBeInTheDocument();
    expect(container.querySelectorAll("button")).toHaveLength(2);

    const shell = screen.getByTestId("drop-zone");
    expect(shell.className).not.toMatch(/max-h-/);
  });

  it("keeps main comment submission wired after removing expand", async () => {
    const { container, onSubmit } = renderCommentInput();

    fireEvent.change(screen.getByTestId("editor"), {
      target: { value: "hello from composer" },
    });
    fireEvent.click(getSubmitButton(container));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("hello from composer", undefined, undefined);
    });
  });

  it("keeps reply submission wired after removing expand", async () => {
    const { container, onSubmit } = renderReplyInput();

    fireEvent.change(screen.getByTestId("editor"), {
      target: { value: "thread reply" },
    });
    fireEvent.click(getSubmitButton(container));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("thread reply", undefined, undefined);
    });
  });

  it("locks the editor while the send is in flight, then clears on success", async () => {
    let resolveSubmit: (ok: boolean) => void = () => {};
    const onSubmit = vi.fn(
      () => new Promise<boolean>((resolve) => { resolveSubmit = resolve; }),
    );
    const { container } = renderCommentInput(onSubmit);

    fireEvent.change(screen.getByTestId("editor"), { target: { value: "sending" } });
    fireEvent.click(getSubmitButton(container));

    // In flight: text kept, editor wrapper locked (aria-busy), not cleared yet.
    await waitFor(() =>
      expect(screen.getByTestId("editor").closest("[aria-busy]")).toHaveAttribute(
        "aria-busy",
        "true",
      ),
    );
    expect(onSubmit).toHaveBeenCalledWith("sending", undefined, undefined);

    resolveSubmit(true);

    // Success: the composer clears (now empty → submit disabled, lock released).
    await waitFor(() => expect(getSubmitButton(container)).toBeDisabled());
    expect(screen.getByTestId("editor").closest("[aria-busy]")).toBeNull();
  });

  it("keeps the draft when the send fails (no optimistic clear)", async () => {
    const onSubmit = vi.fn().mockResolvedValue(false);
    const { container } = renderCommentInput(onSubmit);

    fireEvent.change(screen.getByTestId("editor"), { target: { value: "will fail" } });
    fireEvent.click(getSubmitButton(container));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // Failed send must NOT clear — the box still has content, submit stays live.
    await waitFor(() => expect(getSubmitButton(container)).not.toBeDisabled());
  });

  it("blocks main comment submission until image uploads finish", async () => {
    const pending = deferred<UploadResult | null>();
    uploadWithToast.mockReturnValueOnce(pending.promise);
    const { container, onSubmit } = renderCommentInput();

    fireEvent.change(screen.getByTestId("editor"), {
      target: { value: "comment with evidence" },
    });
    fireEvent.change(getFileInput(container), {
      target: {
        files: [new File(["img"], "image.png", { type: "image/png" })],
      },
    });

    await waitFor(() => {
      expect(getSubmitButton(container)).toBeDisabled();
    });
    fireEvent.click(getSubmitButton(container));
    expect(onSubmit).not.toHaveBeenCalled();

    pending.resolve(makeUploadResult());

    await waitFor(() => {
      expect(getSubmitButton(container)).not.toBeDisabled();
    });
    fireEvent.click(getSubmitButton(container));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "comment with evidence\n/uploads/workspaces/ws/att-1.png",
        ["att-1"],
        undefined,
      );
    });
  });

  it("blocks reply submission until image uploads finish", async () => {
    const pending = deferred<UploadResult | null>();
    uploadWithToast.mockReturnValueOnce(pending.promise);
    const { container, onSubmit } = renderReplyInput();

    fireEvent.change(screen.getByTestId("editor"), {
      target: { value: "reply with evidence" },
    });
    fireEvent.change(getFileInput(container), {
      target: {
        files: [new File(["img"], "image.png", { type: "image/png" })],
      },
    });

    await waitFor(() => {
      expect(getSubmitButton(container)).toBeDisabled();
    });
    fireEvent.click(getSubmitButton(container));
    expect(onSubmit).not.toHaveBeenCalled();

    pending.resolve(makeUploadResult());

    await waitFor(() => {
      expect(getSubmitButton(container)).not.toBeDisabled();
    });
    fireEvent.click(getSubmitButton(container));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "reply with evidence\n/uploads/workspaces/ws/att-1.png",
        ["att-1"],
        undefined,
      );
    });
  });
});
