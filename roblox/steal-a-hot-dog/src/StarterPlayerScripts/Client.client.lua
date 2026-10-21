--[[
	Steal a Hot Dog - client interface.
	Builds the HUD, the shop and the notification toasts in code.
--]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local MarketplaceService = game:GetService("MarketplaceService")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local HotDogData = require(ReplicatedStorage:WaitForChild("HotDogData"))
local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local BuyHotDog = Remotes:WaitForChild("BuyHotDog")
local Notify = Remotes:WaitForChild("Notify")

local DARK = Color3.fromRGB(24, 26, 34)
local PANEL = Color3.fromRGB(32, 35, 45)
local ACCENT = Color3.fromRGB(255, 176, 60)
local GREEN = Color3.fromRGB(90, 215, 130)
local RED = Color3.fromRGB(255, 105, 105)
local TEXT = Color3.fromRGB(240, 242, 248)

local KIND_COLOR = {
	good = GREEN,
	warn = ACCENT,
	bad = RED,
	info = Color3.fromRGB(120, 190, 255),
}

local function corner(parent, radius)
	local item = Instance.new("UICorner")
	item.CornerRadius = UDim.new(0, radius or 10)
	item.Parent = parent
	return item
end

local function stroke(parent, color, thickness)
	local item = Instance.new("UIStroke")
	item.Color = color
	item.Thickness = thickness or 1
	item.Transparency = 0.35
	item.Parent = parent
	return item
end

local function padding(parent, amount)
	local item = Instance.new("UIPadding")
	item.PaddingTop = UDim.new(0, amount)
	item.PaddingBottom = UDim.new(0, amount)
	item.PaddingLeft = UDim.new(0, amount)
	item.PaddingRight = UDim.new(0, amount)
	item.Parent = parent
	return item
end

local screen = Instance.new("ScreenGui")
screen.Name = "StealAHotDog"
screen.ResetOnSpawn = false
screen.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
screen.Parent = player:WaitForChild("PlayerGui")

----------------------------------------------------------------------
-- Cash HUD
----------------------------------------------------------------------

local hud = Instance.new("Frame")
hud.Name = "Hud"
hud.Size = UDim2.fromOffset(240, 78)
hud.Position = UDim2.fromOffset(18, 18)
hud.BackgroundColor3 = DARK
hud.BackgroundTransparency = 0.1
hud.BorderSizePixel = 0
hud.Parent = screen
corner(hud, 14)
stroke(hud, ACCENT)

local cashLabel = Instance.new("TextLabel")
cashLabel.BackgroundTransparency = 1
cashLabel.Size = UDim2.new(1, -20, 0, 40)
cashLabel.Position = UDim2.fromOffset(14, 8)
cashLabel.Font = Enum.Font.GothamBold
cashLabel.TextXAlignment = Enum.TextXAlignment.Left
cashLabel.TextColor3 = TEXT
cashLabel.TextSize = 28
cashLabel.Text = "$0"
cashLabel.Parent = hud

local rateLabel = Instance.new("TextLabel")
rateLabel.BackgroundTransparency = 1
rateLabel.Size = UDim2.new(1, -20, 0, 22)
rateLabel.Position = UDim2.fromOffset(14, 46)
rateLabel.Font = Enum.Font.GothamMedium
rateLabel.TextXAlignment = Enum.TextXAlignment.Left
rateLabel.TextColor3 = GREEN
rateLabel.TextSize = 16
rateLabel.Text = "+$0 / sec"
rateLabel.Parent = hud

----------------------------------------------------------------------
-- Carry banner
----------------------------------------------------------------------

local banner = Instance.new("TextLabel")
banner.Name = "CarryBanner"
banner.AnchorPoint = Vector2.new(0.5, 0)
banner.Position = UDim2.new(0.5, 0, 0, 18)
banner.Size = UDim2.fromOffset(460, 44)
banner.BackgroundColor3 = DARK
banner.BackgroundTransparency = 0.1
banner.BorderSizePixel = 0
banner.Font = Enum.Font.GothamBold
banner.TextSize = 18
banner.TextColor3 = ACCENT
banner.Text = ""
banner.Visible = false
banner.Parent = screen
corner(banner, 12)
stroke(banner, ACCENT)

----------------------------------------------------------------------
-- Toasts
----------------------------------------------------------------------

local toasts = Instance.new("Frame")
toasts.Name = "Toasts"
toasts.AnchorPoint = Vector2.new(0.5, 1)
toasts.Position = UDim2.new(0.5, 0, 1, -130)
toasts.Size = UDim2.fromOffset(520, 220)
toasts.BackgroundTransparency = 1
toasts.Parent = screen

local toastLayout = Instance.new("UIListLayout")
toastLayout.SortOrder = Enum.SortOrder.LayoutOrder
toastLayout.VerticalAlignment = Enum.VerticalAlignment.Bottom
toastLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
toastLayout.Padding = UDim.new(0, 6)
toastLayout.Parent = toasts

local function toast(message, kind)
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromOffset(520, 36)
	label.BackgroundColor3 = DARK
	label.BackgroundTransparency = 0.12
	label.BorderSizePixel = 0
	label.Font = Enum.Font.GothamMedium
	label.TextSize = 16
	label.TextColor3 = KIND_COLOR[kind] or TEXT
	label.Text = message
	label.Parent = toasts
	corner(label, 10)

	task.delay(3.5, function()
		local tween = TweenService:Create(label, TweenInfo.new(0.4), {
			BackgroundTransparency = 1,
			TextTransparency = 1,
		})
		tween.Completed:Connect(function()
			label:Destroy()
		end)
		tween:Play()
	end)
end

----------------------------------------------------------------------
-- Shop
----------------------------------------------------------------------

local shop = Instance.new("Frame")
shop.Name = "Shop"
shop.AnchorPoint = Vector2.new(0.5, 0.5)
shop.Position = UDim2.fromScale(0.5, 0.5)
shop.Size = UDim2.fromOffset(640, 520)
shop.BackgroundColor3 = PANEL
shop.BorderSizePixel = 0
shop.Visible = false
shop.Parent = screen
corner(shop, 16)
stroke(shop, ACCENT, 2)

local shopTitle = Instance.new("TextLabel")
shopTitle.BackgroundTransparency = 1
shopTitle.Size = UDim2.new(1, -24, 0, 48)
shopTitle.Position = UDim2.fromOffset(20, 12)
shopTitle.Font = Enum.Font.GothamBold
shopTitle.TextXAlignment = Enum.TextXAlignment.Left
shopTitle.TextColor3 = ACCENT
shopTitle.TextSize = 26
shopTitle.Text = "HOT DOG SHOP"
shopTitle.Parent = shop

local closeButton = Instance.new("TextButton")
closeButton.AnchorPoint = Vector2.new(1, 0)
closeButton.Position = UDim2.new(1, -16, 0, 16)
closeButton.Size = UDim2.fromOffset(38, 38)
closeButton.BackgroundColor3 = Color3.fromRGB(58, 62, 76)
closeButton.BorderSizePixel = 0
closeButton.Font = Enum.Font.GothamBold
closeButton.TextSize = 20
closeButton.TextColor3 = TEXT
closeButton.Text = "X"
closeButton.Parent = shop
corner(closeButton, 10)

local list = Instance.new("ScrollingFrame")
list.Position = UDim2.fromOffset(16, 66)
list.Size = UDim2.new(1, -32, 1, -84)
list.BackgroundTransparency = 1
list.BorderSizePixel = 0
list.ScrollBarThickness = 6
list.CanvasSize = UDim2.new()
list.AutomaticCanvasSize = Enum.AutomaticSize.Y
list.Parent = shop

local listLayout = Instance.new("UIListLayout")
listLayout.SortOrder = Enum.SortOrder.LayoutOrder
listLayout.Padding = UDim.new(0, 8)
listLayout.Parent = list

local priceButtons = {}

local function buildRow(info)
	local row = Instance.new("Frame")
	row.Size = UDim2.new(1, -8, 0, 76)
	row.BackgroundColor3 = Color3.fromRGB(42, 46, 58)
	row.BorderSizePixel = 0
	row.LayoutOrder = info.Index
	row.Parent = list
	corner(row, 12)
	stroke(row, HotDogData.RarityColor[info.Rarity] or TEXT)

	local name = Instance.new("TextLabel")
	name.BackgroundTransparency = 1
	name.Position = UDim2.fromOffset(16, 10)
	name.Size = UDim2.fromOffset(300, 26)
	name.Font = Enum.Font.GothamBold
	name.TextXAlignment = Enum.TextXAlignment.Left
	name.TextSize = 19
	name.TextColor3 = HotDogData.RarityColor[info.Rarity] or TEXT
	name.Text = info.Name
	name.Parent = row

	local detail = Instance.new("TextLabel")
	detail.BackgroundTransparency = 1
	detail.Position = UDim2.fromOffset(16, 38)
	detail.Size = UDim2.fromOffset(300, 22)
	detail.Font = Enum.Font.GothamMedium
	detail.TextXAlignment = Enum.TextXAlignment.Left
	detail.TextSize = 15
	detail.TextColor3 = GREEN
	detail.Text = string.format("%s  -  $%s / sec", info.Rarity, HotDogData.Comma(info.Income))
	detail.Parent = row

	local buy = Instance.new("TextButton")
	buy.AnchorPoint = Vector2.new(1, 0.5)
	buy.Position = UDim2.new(1, -14, 0.5, 0)
	buy.Size = UDim2.fromOffset(150, 40)
	buy.BackgroundColor3 = Color3.fromRGB(56, 140, 86)
	buy.BorderSizePixel = 0
	buy.Font = Enum.Font.GothamBold
	buy.TextSize = 17
	buy.TextColor3 = TEXT
	buy.Text = "$" .. HotDogData.Comma(info.Price)
	buy.Parent = row
	corner(buy, 10)

	buy.Activated:Connect(function()
		BuyHotDog:FireServer(info.Id)
	end)

	priceButtons[info.Id] = buy

	if info.Robux > 0 then
		buy.Size = UDim2.fromOffset(150, 30)
		buy.Position = UDim2.new(1, -14, 0.5, -17)

		local robux = Instance.new("TextButton")
		robux.AnchorPoint = Vector2.new(1, 0.5)
		robux.Position = UDim2.new(1, -14, 0.5, 19)
		robux.Size = UDim2.fromOffset(150, 30)
		robux.BackgroundColor3 = Color3.fromRGB(62, 96, 170)
		robux.BorderSizePixel = 0
		robux.Font = Enum.Font.GothamBold
		robux.TextSize = 16
		robux.TextColor3 = TEXT
		robux.Text = "R$ " .. HotDogData.Comma(info.Robux)
		robux.Parent = row
		corner(robux, 10)

		robux.Activated:Connect(function()
			if info.DevProductId == 0 then
				toast(info.Name .. ": Robux product not configured yet.", "warn")
				return
			end
			MarketplaceService:PromptProductPurchase(player, info.DevProductId)
		end)
	end
end

for _, info in ipairs(HotDogData.List) do
	buildRow(info)
end

local shopToggle = Instance.new("TextButton")
shopToggle.AnchorPoint = Vector2.new(0, 0)
shopToggle.Position = UDim2.fromOffset(18, 108)
shopToggle.Size = UDim2.fromOffset(170, 48)
shopToggle.BackgroundColor3 = ACCENT
shopToggle.BorderSizePixel = 0
shopToggle.Font = Enum.Font.GothamBold
shopToggle.TextSize = 20
shopToggle.TextColor3 = Color3.fromRGB(28, 22, 10)
shopToggle.Text = "SHOP"
shopToggle.Parent = screen
corner(shopToggle, 12)

local help = Instance.new("TextLabel")
help.BackgroundColor3 = DARK
help.BackgroundTransparency = 0.25
help.BorderSizePixel = 0
help.Position = UDim2.fromOffset(18, 166)
help.Size = UDim2.fromOffset(250, 96)
help.Font = Enum.Font.GothamMedium
help.TextSize = 14
help.TextColor3 = Color3.fromRGB(205, 210, 222)
help.TextWrapped = true
help.TextXAlignment = Enum.TextXAlignment.Left
help.TextYAlignment = Enum.TextYAlignment.Top
help.Text = "Buy hot dogs to earn cash every second.\nHold E on someone else's hot dog to steal it, then run it onto your green DROP OFF pad.\nHold E on your blue pillar to shield your base."
help.Parent = screen
corner(help, 12)
padding(help, 10)

shopToggle.Activated:Connect(function()
	shop.Visible = not shop.Visible
end)

closeButton.Activated:Connect(function()
	shop.Visible = false
end)

----------------------------------------------------------------------
-- State
----------------------------------------------------------------------

local function refreshAffordable(cash)
	for id, button in pairs(priceButtons) do
		local info = HotDogData.ById[id]
		local affordable = cash >= info.Price
		button.BackgroundColor3 = affordable and Color3.fromRGB(56, 140, 86) or Color3.fromRGB(70, 74, 88)
		button.TextTransparency = affordable and 0 or 0.35
	end
end

local function watchCash()
	local stats = player:WaitForChild("leaderstats")
	local cash = stats:WaitForChild("Cash")

	local function update()
		cashLabel.Text = "$" .. HotDogData.Comma(cash.Value)
		refreshAffordable(cash.Value)
	end

	cash.Changed:Connect(update)
	update()
end

local function updateIncome()
	local income = player:GetAttribute("Income") or 0
	rateLabel.Text = "+$" .. HotDogData.Comma(income) .. " / sec"
end

local function updateCarrying()
	local carrying = player:GetAttribute("Carrying")
	if carrying and carrying ~= "" then
		banner.Visible = true
		banner.Text = "Carrying " .. carrying .. " - get it to your DROP OFF pad!"
	else
		banner.Visible = false
	end
end

task.spawn(watchCash)
player:GetAttributeChangedSignal("Income"):Connect(updateIncome)
player:GetAttributeChangedSignal("Carrying"):Connect(updateCarrying)
updateIncome()
updateCarrying()

Notify.OnClientEvent:Connect(function(message, kind)
	toast(message, kind)
end)
