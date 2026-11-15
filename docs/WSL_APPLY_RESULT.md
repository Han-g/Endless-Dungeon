# WSL 서버 적용 결과

확인 시각: 2026-11-16T00:54:25+09:00

- 기준 경로: /home/ark98/projects/endless-dungeon-server
- 원본 커밋: d8bd2649ae82bec5fac34af22ece9c1ab73d3c3f
- 통합 구현 커밋: 925143fc32f7cd7a3ead9d4d94b2659b62b44974
- 검증 후 main에 fast-forward 적용. 원격 저장소 업로드 없음.
- 기존 npm/tsx 감시 프로세스를 유지하며 파일 적용 중에만 감시 프로세스를 일시 정지하고, 완료 후 재개하여 서버 재시작 확인.
- WSL Node 서버의 2567 포트와 기존 Redis의 6379 포트 확인.
- Windows → http://localhost:2567/health: HTTP 200, {"ok":true}.
- Windows → 인증 없는 /api/auth/me: HTTP 401.
- 실제 MongoDB 기존 계정 5개: 적용 전후 전체 문서 해시 일치.
- .env.development, .env.production, 기존 password.ts/AccountRepository.ts/config.ts: 원본 해시 유지.
- 타입 검사, 배포용 빌드, 총 27개 검증 항목 통과. 상세 실행 기록은 WSL_AUTH_WAITING_ROOM_INTEGRATION.md 참고.
- 기존 로그인 토큰은 새 단일 세션 정책 때문에 재로그인 필요. 계정/비밀번호 재설정 불필요.
- 실제 Unity 로그인 화면과 플레이는 조작하지 않았으며 Windows에서 서버까지의 HTTP 접근을 확인함.
- 격리 작업 폴더는 적용 후 정리하고 Git 통합 브랜치 및 비공개 원본 백업은 보존.

원본 백업: /home/ark98/projects/endless-dungeon-server/.local-backups/before-wsl-integration-20261115-230845

앞으로 서버를 수정·실행할 때는 위 WSL 기준 경로를 사용합니다. Windows 서버 사본은 자동 동기화되지 않습니다.
