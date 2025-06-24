const contract = new ethers.Contract(
  window.CONFIG.ENHANCED_CONTRACT_ADDRESS,
  window.UnitpayEnhancedAbi,
  signer
);

contract.once('PaymentConfirmed', (paymentId, isAuto) => {
  console.log('支付已完成:', paymentId, isAuto);
  showToast(`支付已完成: ${paymentId}`, 'success');
  loadTaskPool(currentTaskTab);
}); 