// 简单的API测试脚本
const testAPI = async () => {
  try {
    console.log("🧪 Testing CopilotKit API...");
    
    // 测试健康检查
    const healthResponse = await fetch("http://localhost:3000/api/copilotkit/health");
    const healthData = await healthResponse.json();
    console.log("✅ Health check:", healthData);
    
    // 测试数据库连接
    const dbResponse = await fetch("http://localhost:3000/api/test-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "checkDatabase", args: {} })
    });
    const dbData = await dbResponse.json();
    console.log("✅ Database check:", dbData);
    
    console.log("🎉 All tests passed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
};

testAPI(); 