// 测试内联JavaScript函数
const { ethers } = require("ethers");

// 模拟Chainlink Functions环境
global.Functions = {
  encodeUint256: (val) => {
    return new Uint8Array(ethers.utils.arrayify(ethers.utils.hexZeroPad(ethers.utils.hexlify(val), 32)));
  }
};

// 直接返回值测试
function test1() {
  console.log("测试1: 直接返回 Functions.encodeUint256(1)");
  try {
    const result = Functions.encodeUint256(1);
    console.log("返回类型:", result.constructor.name);
    console.log("返回值:", result);
    console.log("测试1成功: 返回了Uint8Array类型的数据");
  } catch (error) {
    console.error("测试1失败:", error);
  }
}

// 使用中间变量测试
function test2() {
  console.log("\n测试2: 使用中间变量 const result = Functions.encodeUint256(1); return result;");
  try {
    const result = Functions.encodeUint256(1); 
    console.log("返回类型:", result.constructor.name);
    console.log("返回值:", result);
    console.log("测试2成功: 返回了Uint8Array类型的数据");
  } catch (error) {
    console.error("测试2失败:", error);
  }
}

// 运行测试
test1();
test2(); 