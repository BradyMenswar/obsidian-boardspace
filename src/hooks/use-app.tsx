import { AppContext } from "context/app-context";
import { App } from "obsidian";
import { useContext } from "react";

export const useApp = (): App => {
	const app = useContext(AppContext);
	if (!app) {
		throw new Error("useApp must be used within AppContext.Provider");
	}

	return app;
};
