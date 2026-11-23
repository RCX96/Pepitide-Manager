// Exceções de console aceitas nos testes de navegador. Cada item precisa de motivo.
export const allowlist = [
  // O teste de offline desliga a rede de propósito; falhas de rede são esperadas nele.
  /Failed to load resource/i,
  // O navegador pode reclamar do favicon em páginas de teste sem ícone dedicado.
  /favicon/i,
];
