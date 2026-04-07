import { App, TFile } from "obsidian";
import { TLAsset, TLAssetStore } from "tldraw";

const BOARDSPACE_VAULT_PATH_META_KEY = "boardspaceVaultPath";

export function createBoardspaceAssetStore(
	app: App,
	boardFile: TFile | null,
): TLAssetStore {
	return {
		async upload(asset: TLAsset, file: File) {
			const attachmentPath =
				await app.fileManager.getAvailablePathForAttachment(
					file.name,
					boardFile?.path ?? "",
				);
			const savedFile = await app.vault.createBinary(
				attachmentPath,
				await file.arrayBuffer(),
			);

			return {
				meta: {
					[BOARDSPACE_VAULT_PATH_META_KEY]: savedFile.path,
				},
				src: asset.id,
			};
		},
		resolve(asset) {
			const vaultPath = asset.meta[BOARDSPACE_VAULT_PATH_META_KEY];
			if (typeof vaultPath !== "string" || vaultPath.length === 0) {
				return asset.props.src;
			}

			const file = app.vault.getAbstractFileByPath(vaultPath);
			if (!(file instanceof TFile)) {
				return null;
			}

			return app.vault.getResourcePath(file);
		},
	};
}
