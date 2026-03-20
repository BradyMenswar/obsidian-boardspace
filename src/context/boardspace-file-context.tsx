import { createContext, useContext } from "react";

const BoardspaceFileContext = createContext<string>("");

export function BoardspaceFileProvider({
	children,
	value,
}: {
	children: React.ReactNode;
	value: string;
}) {
	return (
		<BoardspaceFileContext.Provider value={value}>
			{children}
		</BoardspaceFileContext.Provider>
	);
}

export function useBoardspaceFilePath() {
	return useContext(BoardspaceFileContext);
}
