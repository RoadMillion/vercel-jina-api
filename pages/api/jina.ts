import type { NextApiRequest, NextApiResponse } from "next";
import { fetch } from 'undici'; // 确保导入 fetch
// AbortController 在现代 Node.js 中是全局可用的，无需导入

// --- 重要提示 ---
// 请将下面的占位符替换为实际用于获取 Jina 爬取所需 Header 的 API 端点 URL。
// 这个 URL 应该返回一个包含必要 Header 的 JSON 对象。
const jinaCrawlHeaderUrl = "https://basic-crawl-param.1451871636.workers.dev";
// --- 重要提示 ---

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse, // 响应类型可以是多种，不限于固定 Data
) {
  // 1. 从查询参数获取原始 URL
  const originalUrl = req.query.url;

  // 2. 验证 URL 参数是否存在且为字符串
  if (!originalUrl || typeof originalUrl !== 'string') {
    // 如果缺少或类型不正确，返回 400 错误
    return res.status(400).send('Missing or invalid "url" query parameter');
  }

  try {
    // 3. 获取用于 Jina 代理请求的 Header
    console.log(`Fetching headers from: ${jinaCrawlHeaderUrl}`);
    const headerResponse = await fetch(jinaCrawlHeaderUrl); // 发起请求获取 Header

    // 检查获取 Header 的请求是否成功
    if (!headerResponse.ok) {
        console.error(`Error fetching crawl headers: ${headerResponse.status} ${headerResponse.statusText}`);
        // 如果获取 Header 失败，返回相应的错误状态和信息
        return res.status(headerResponse.status).send('Error fetching crawl headers: ' + headerResponse.statusText);
    }

    // 4. 解析 Header 响应体为 JSON
    const headers = await headerResponse.json();
    console.log('Successfully fetched headers.');

    // 5. 构造 Jina 代理 URL
    const prefixedUrl = `https://r.jina.ai/${originalUrl}`;
    console.log('Requesting proxied URL:', prefixedUrl);

    // 6. 使用 AbortController 实现请求超时 (30 秒)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        console.log('Request to Jina proxy timed out after 30 seconds.');
        controller.abort();
    }, 50000); // 30 秒超时

    let proxyResponse;
    try {
        // 使用获取到的 Header 向 Jina 代理发起请求，并传入 signal
        proxyResponse = await fetch(prefixedUrl, {
            headers: headers as HeadersInit,
            signal: controller.signal // 关联 AbortController
        });
    } finally {
        // 无论 fetch 成功还是失败，都清除定时器
        clearTimeout(timeoutId);
    }

    // 7. 处理 Jina 代理的响应
    if (!proxyResponse.ok) {
      // 如果 Jina 代理返回错误，将错误状态和信息透传给客户端
      console.error(`Error fetching from Jina proxy: ${proxyResponse.status} ${proxyResponse.statusText}`);
      return res.status(proxyResponse.status).send('Error fetching from Jina proxy: ' + proxyResponse.statusText);
    }

    // 读取 Jina 代理返回的文本内容
    const content = await proxyResponse.text();
    console.log('Successfully fetched content from Jina proxy.');

    // 8. 将获取到的内容返回给客户端
    // 设置响应头为纯文本 UTF-8
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    // 发送 200 状态码和获取到的内容
    return res.status(200).send(content);

  } catch (err: unknown) { // 使用 unknown 替代 any
    // 9. 统一错误处理
    let errorMessage = 'An unknown error occurred';
    let errorStatus = 500;

    if (err instanceof Error) { // 检查 err 是否为 Error 实例
        errorMessage = err.message; // 安全地访问 message
        if (err.name === 'AbortError') {
            // 如果是超时错误
            console.error('Fetch aborted due to timeout:', err);
            errorMessage = 'Gateway Timeout: The request to the Jina proxy timed out.';
            errorStatus = 504; // 设置状态码为 504
        } else {
            // 其他类型的 Error
            console.error('An unexpected error occurred:', err);
            errorMessage = 'Internal Server Error: ' + err.message;
        }
    } else {
        // 如果 err 不是 Error 实例，记录原始错误信息
        console.error('An unexpected non-Error type was caught:', err);
    }

    // 返回错误状态和信息
    return res.status(errorStatus).send(errorMessage);
  }
}
