import prisma from "../config/Db.js";

// ✅ Add item to cart
export const addToCart = async (req, res) => {
  const { userId, itemId } = req.body;

  try {
    const existingItem = await prisma.cartItem.findUnique({
      where: {
        userId_itemId: { userId: Number(userId), itemId: String(itemId) },
      },
    });

    if (existingItem) {
      await prisma.cartItem.update({
        where: { userId_itemId: { userId: Number(userId), itemId: String(itemId) } },
        data: { quantity: { increment: 1 } },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          userId: Number(userId),
          itemId: String(itemId),
          quantity: 1,
        },
      });
    }

    res.json({ success: true, message: "Added to Cart" });
  } catch (error) {
    console.error("Add to cart error:", error);
    res.json({ success: false, message: "Error adding to cart" });
  }
};

// ✅ Remove item from cart
export const removeFromCart = async (req, res) => {
  const { userId, itemId } = req.body;

  try {
    const existingItem = await prisma.cartItem.findUnique({
      where: {
        userId_itemId: { userId: Number(userId), itemId: String(itemId) },
      },
    });

    if (!existingItem) {
      return res.json({ success: false, message: "Item not found in cart" });
    }

    if (existingItem.quantity > 1) {
      await prisma.cartItem.update({
        where: { userId_itemId: { userId: Number(userId), itemId: String(itemId) } },
        data: { quantity: { decrement: 1 } },
      });
    } else {
      await prisma.cartItem.delete({
        where: { userId_itemId: { userId: Number(userId), itemId: String(itemId) } },
      });
    }

    res.json({ success: true, message: "Removed from Cart" });
  } catch (error) {
    console.error("Remove from cart error:", error);
    res.json({ success: false, message: "Error removing from cart" });
  }
};

// ✅ Get user cart data
export const getCart = async (req, res) => {
  const { userId } = req.body;

  try {
    const cartItems = await prisma.cartItem.findMany({
      where: { userId: Number(userId) },
    });

    res.json({ success: true, cartData: cartItems });
  } catch (error) {
    console.error("Get cart error:", error);
    res.json({ success: false, message: "Error fetching cart" });
  }
};
