// itall fork: 결과 리포트에 표시되는 카테고리명을 한글로 변환한다.
// 카테고리 값은 룰 정의(upstream 포함)에서 오므로, 룰 파일을 건드리지 않고
// 렌더링 시점에만 매핑한다. 매핑이 없는 카테고리는 원본 영어를 그대로 사용한다.
const CATEGORY_LABELS: Record<string, string> = {
  Accessibility: "접근성",
  Architecture: "아키텍처",
  "Bundle Size": "번들 크기",
  Correctness: "정확성",
  "Dead Code": "데드 코드",
  "Next.js": "Next.js",
  Performance: "성능",
  "React Native": "React Native",
  Security: "보안",
  Server: "서버",
  "State & Effects": "상태 & Effect",
  "TanStack Query": "TanStack Query",
  "TanStack Start": "TanStack Start",
};

export const localizeCategory = (category: string): string => CATEGORY_LABELS[category] ?? category;
