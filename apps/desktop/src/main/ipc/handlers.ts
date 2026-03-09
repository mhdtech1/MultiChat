import type { IpcMain, IpcMainInvokeEvent } from "electron";

export type IpcHandler<TArg = unknown, TResult = unknown> = (
  event: IpcMainInvokeEvent,
  arg: TArg,
) => Promise<TResult> | TResult;

export type IpcHandlerRegistry = Record<string, IpcHandler>;

export function registerIpcHandlers(
  ipc: IpcMain,
  handlers: IpcHandlerRegistry,
): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipc.handle(channel, handler);
  }
}
