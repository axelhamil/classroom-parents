const MIN_COURSES = 2;

const wordsOf = (name: string) => name.trim().split(/\s+/).filter(Boolean);

function sharedTail(courses: readonly string[][]): number {
  const [first = [], ...others] = courses;
  let length = 0;

  while (length < first.length) {
    const word = first[first.length - 1 - length];
    const shared = others.every((words) => words[words.length - 1 - length] === word);
    if (!shared) break;
    length += 1;
  }

  return length;
}

/**
 * Shortens the course names of one child for a narrow line: the words every one of their courses
 * ends with ("4e B") say the class, not the subject, so they go. A name that would be left empty
 * keeps its full form; with fewer than two distinct courses nothing is shared, so nothing goes.
 */
export function courseShortener(names: readonly string[]): (name: string) => string {
  const distinct = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (distinct.length < MIN_COURSES) return (name) => name.trim();

  const [first = []] = distinct.map(wordsOf);
  const tail = first.slice(first.length - sharedTail(distinct.map(wordsOf)));

  return (name) => {
    const words = wordsOf(name);
    const kept = words.slice(0, words.length - tail.length);
    const endsWithTail = tail.every((word, index) => words[kept.length + index] === word);

    return tail.length > 0 && kept.length > 0 && endsWithTail ? kept.join(" ") : name.trim();
  };
}
