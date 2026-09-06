import { expect, test, type Page } from "@playwright/test"

async function signIn(page: Page, username: "owner" | "property") {
  const response = await page.request.post("/api/v1/auth/login", { data: { username, password: "123456" } })
  expect(response.ok()).toBe(true)
  const { data } = await response.json()
  await page.addInitScript((session) => sessionStorage.setItem("smart-community-session", JSON.stringify(session)), data)
}

async function checkDialogBounds(page: Page) {
  const layout = await page.getByRole("dialog").evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const footer = element.querySelector(".dialog-footer")!.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: innerHeight, width: innerWidth, footerBottom: footer.bottom, documentWidth: document.documentElement.scrollWidth }
  })
  expect(layout.top).toBeGreaterThanOrEqual(0)
  expect(layout.bottom).toBeLessThanOrEqual(layout.height)
  expect(layout.footerBottom).toBeLessThanOrEqual(layout.bottom)
  expect(layout.left).toBeGreaterThanOrEqual(0)
  expect(layout.right).toBeLessThanOrEqual(layout.width)
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.width)
}

test("AI-disabled repair stays editable; fixture suggestion requires acceptance at tablet sizes", async ({ page }, testInfo) => {
  await signIn(page, "owner")
  await page.goto("/app/repairs")
  await page.getByRole("button", { name: "提交报修" }).click()
  const form = page.getByRole("dialog", { name: "提交报修" })
  await form.getByLabel("问题描述").fill("厨房水龙头持续漏水")
  const disabledResponse = page.waitForResponse((response) => response.url().endsWith("/ai/repair-draft"))
  await form.getByRole("button", { name: "AI 整理" }).click()
  expect((await disabledResponse).status()).toBe(503)
  await expect(form.getByRole("alert")).toContainText("手动填写")
  await expect(form.getByLabel("问题描述")).toHaveValue("厨房水龙头持续漏水")
  await expect(form.getByLabel("问题描述")).toBeEnabled()

  // UI contract fixture only: this does not claim a live cloud-model result.
  await page.route("**/api/v1/ai/repair-draft", (route) => route.fulfill({ json: {
    data: { category: "水电维修", description: "厨房水龙头持续漏水，需要检查处理。", priority: "NORMAL", missingInfo: ["问题从什么时候开始？"] }, requestId: "ai-ui-fixture",
  } }))
  await form.getByRole("button", { name: "AI 整理" }).click()
  const preview = form.getByRole("region", { name: "AI 建议" })
  await expect(preview).toBeVisible()
  for (const width of [1024, 800, 390]) {
    await page.setViewportSize({ width, height: 768 })
    await preview.getByRole("button", { name: "采用建议" }).scrollIntoViewIfNeeded()
    await checkDialogBounds(page)
    await page.screenshot({ path: testInfo.outputPath(`ai-repair-${width}.png`) })
  }
  await expect(form.getByLabel("类型")).toHaveValue("公共设施")
  await preview.getByRole("button", { name: "不采用" }).click()
  await expect(preview).toBeHidden()
  await expect(form.getByLabel("问题描述")).toHaveValue("厨房水龙头持续漏水")
  await form.getByRole("button", { name: "AI 整理" }).click()
  await preview.getByRole("button", { name: "采用建议" }).click()
  await expect(form.getByLabel("类型")).toHaveValue("水电维修")
  await expect(form.getByLabel("问题描述")).toHaveValue("厨房水龙头持续漏水，需要检查处理。")
  await expect(form).toBeVisible()
})

test("property can preview and adopt a notice fixture without publishing", async ({ page }, testInfo) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  await signIn(page, "property")
  await page.goto("/app/notices")
  await page.getByRole("button", { name: "新建公告" }).click()
  const form = page.getByRole("dialog", { name: "新建公告草稿" })
  await form.getByLabel("标题").fill("花园维护")
  await form.getByLabel("内容").fill("周六九点到十点维护花园，暂不开放")
  await page.route("**/api/v1/ai/notice-draft", (route) => route.fulfill({ json: {
    data: { title: "花园维护通知", content: "周六 9:00 至 10:00 进行花园维护，期间暂停开放。", missingInfo: [] }, requestId: "ai-ui-fixture",
  } }))
  await form.getByRole("button", { name: "AI 拟稿" }).click()
  const preview = form.getByRole("region", { name: "AI 建议" })
  await expect(preview).toBeVisible()
  await checkDialogBounds(page)
  await page.screenshot({ path: testInfo.outputPath("ai-notice-1024.png") })
  await expect(form.getByLabel("标题")).toHaveValue("花园维护")
  await preview.getByRole("button", { name: "采用建议" }).click()
  await expect(form.getByLabel("标题")).toHaveValue("花园维护通知")
  await expect(form).toBeVisible()
  expect(pageErrors).toEqual([])
})
