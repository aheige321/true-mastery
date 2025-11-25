// 这是一个纯测试函数
exports.handler = async function(event, context) {
  console.log("测试函数已运行！");
  return {
    statusCode: 200,
    body: "Hello World"
  };
};