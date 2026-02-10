/**
 * Returns a debounced version of the function.
 * The returned function has a cancel() method.
 */
export function debounce<T extends (...args: never[]) => void>(
	fn: T,
	delayMs: number,
): ((...args: Parameters<T>) => void) & { cancel(): void } {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const debounced = (...args: Parameters<T>): void => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => {
			timeoutId = null;
			fn(...args);
		}, delayMs);
	};

	debounced.cancel = (): void => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	return debounced;
}
